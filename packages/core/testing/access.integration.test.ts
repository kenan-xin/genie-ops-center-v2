import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  landingRoute,
  permittedNavigation,
} from "../src/lib/entitlement/index.ts";
import { createModuleTRPC } from "../src/lib/entitlement/module-trpc.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import type { AssignmentQuery } from "../src/services/authorization/grant-reader.ts";
import {
  CORE_PERMISSION_KEYS,
  TENANT_ADMINISTRATOR_ROLE,
  can,
  createGrantReader,
  createRecordResolver,
  createRequestPrincipal,
  permissionCatalogue,
  principalFor,
  scopesFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { setModuleEnabled } from "../src/services/module-management/index.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertPersonWith,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The shared `can()` and `scopesFor()` suite of DEC-39 and DEC-48 (Spec 2 AC-8, AC-23), against a
 * real Postgres with the real core history. Every principal reads real `role_assignment` rows
 * through the real loader; nothing fakes a permission answer.
 */
const FOLDER = { type: "fixture_folder", id: "folder-1" };

const RECORD = { type: "fixture_record", id: "record-1" };

let resolverCalls = 0;

/** The tenant each resolver call received, so the suite can prove it is the request's own. */
const resolverTenants: unknown[] = [];

/** A parent the fixture's resolver returns but its record type does not declare. */
const UNDECLARED = { type: "fixture_shelf", id: "shelf-1" };

const trpc = createModuleTRPC("fixture");

/** The fixture's workspace route, refusing in its own `can()` check as every route must. */
const fixtureRouter = trpc.router({
  home: trpc.procedure.query(async ({ ctx }) => {
    if (!(await can(ctx.caller, "fixture:use"))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return "home";
  }),
});

const fixtureModule: Module = {
  ...validModule,
  router: fixtureRouter,
  recordTypes: [
    {
      type: RECORD.type,
      parentTypes: [FOLDER.type],
      resolve: async (ctx, id) => {
        resolverCalls += 1;
        resolverTenants.push(ctx.tenant);

        return { label: `Record ${id}`, parents: [FOLDER, UNDECLARED] };
      },
    },
  ],
  navigation: {
    ...validModule.navigation,
    entries: validModule.navigation.entries.map((entry) =>
      entry.id === "fixture-home"
        ? Object.assign({}, entry, { landing: true })
        : entry
    ),
  },
};

const modules = [fixtureModule];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment(modules);
  await enableModules(deployment.context, ["fixture"]);
  await seedRoles(deployment.context, modules);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

/** One request: a fresh principal with its own loader, never shared (R-27). */
function request(userId: string | undefined) {
  return principalFor({ tenant: deployment.context, modules, userId });
}

/** A pool that counts the statements the loader sends, and sends them to the real database. */
function countingPool() {
  const pool = deployment.context.db.$client;
  let queries = 0;

  const counting: AssignmentQuery = (text, values) => {
    queries += 1;

    return pool.query(text, [...values]);
  };

  return { counting, queries: () => queries };
}

async function tenantAdministratorKeys(): Promise<readonly string[]> {
  const result = await deployment.context.db.$client.query<{
    permissions: string[];
  }>("select permissions from role where name = $1", [
    TENANT_ADMINISTRATOR_ROLE,
  ]);

  return result.rows[0]?.permissions ?? [];
}

describe("the access seam against a real database", () => {
  it("reads one assignment query for many calls in one request", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
      "fixture:read",
    ]);

    const pool = countingPool();

    const caller = createRequestPrincipal(
      { userId, groups: [] },
      createGrantReader(pool.counting, userId, permissionCatalogue(modules))
    );

    await Promise.all([
      can(caller, "fixture:use"),
      can(caller, "fixture:read"),
      scopesFor(caller, "fixture:use"),
    ]);
    await can(caller, "fixture:admin");
    await scopesFor(caller, "fixture:read");

    expect(await can(caller, "fixture:use")).toBe(true);
    expect(pool.queries()).toBe(1);
  });

  it("applies a revoked role on the next request", async () => {
    const { userId, assignmentId } = await insertPersonWith(
      deployment.context,
      ["fixture:use"]
    );

    const first = request(userId);

    expect(await can(first, "fixture:use")).toBe(true);

    await deployment.context.db.$client.query(
      "delete from role_assignment where id = $1",
      [assignmentId]
    );

    // The same request keeps its one read; the next request reads again and is refused.
    expect(await can(first, "fixture:use")).toBe(true);
    expect(await can(request(userId), "fixture:use")).toBe(false);
  });

  it("grants a record scope and a declared parent scope, resolving the record once per request", async () => {
    const direct = await insertPersonWith(
      deployment.context,
      ["fixture:read"],
      RECORD
    );

    const parent = await insertPersonWith(
      deployment.context,
      ["fixture:read", "fixture:use"],
      FOLDER
    );

    const neither = await insertPersonWith(
      deployment.context,
      ["fixture:read"],
      {
        type: FOLDER.type,
        id: "folder-2",
      }
    );

    expect(await can(request(direct.userId), "fixture:read", RECORD)).toBe(
      true
    );

    resolverCalls = 0;
    const viaParent = request(parent.userId);

    expect(await can(viaParent, "fixture:read", RECORD)).toBe(true);
    expect(await can(viaParent, "fixture:use", RECORD)).toBe(true);
    expect(resolverCalls).toBe(1);

    expect(await can(request(neither.userId), "fixture:read", RECORD)).toBe(
      false
    );
  });

  it("resolves parents through the request's tenant and drops an undeclared parent type", async () => {
    const shelf = await insertPersonWith(
      deployment.context,
      ["fixture:read"],
      UNDECLARED
    );

    resolverTenants.length = 0;

    expect(await can(request(shelf.userId), "fixture:read", RECORD)).toBe(
      false
    );
    expect(resolverTenants).toEqual([deployment.context]);
  });

  it("grants nothing to a banned or erased person, and restores an expired ban", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const set = (assignments: string) =>
      deployment.context.db.$client.query(
        `update "user" set ${assignments} where id = $1`,
        [userId]
      );

    await set("banned = true, ban_expires = null");

    expect(await can(request(userId), "fixture:use")).toBe(false);

    await set("ban_expires = now() + interval '1 day'");

    expect(await can(request(userId), "fixture:use")).toBe(false);

    await set("ban_expires = now() - interval '1 day'");

    expect(await can(request(userId), "fixture:use")).toBe(true);

    await set("banned = false, erased_at = now()");

    expect(await can(request(userId), "fixture:use")).toBe(false);
  });

  it("refuses a half-null scope at the database", async () => {
    const { roleId, userId } = await insertPersonWith(deployment.context, [
      "fixture:read",
    ]);

    await expect(
      deployment.context.db.$client.query(
        "insert into role_assignment (role_id, principal_type, principal_id, scope_type) values ($1, 'user', $2, 'fixture_record')",
        [roleId, userId]
      )
    ).rejects.toThrow("role_assignment_scope_pair");
  });

  it("answers scopesFor with all for a tenant-wide assignment and the list otherwise", async () => {
    const wide = await insertPersonWith(deployment.context, ["fixture:read"]);

    const narrow = await insertPersonWith(
      deployment.context,
      ["fixture:read"],
      FOLDER
    );

    expect(await scopesFor(request(wide.userId), "fixture:read")).toEqual({
      kind: "all",
    });
    expect(await scopesFor(request(narrow.userId), "fixture:read")).toEqual({
      kind: "some",
      scopes: [FOLDER],
    });
    expect(await scopesFor(request(narrow.userId), "fixture:admin")).toEqual({
      kind: "none",
    });
  });

  it("grants through a group, and not through an archived group until it is restored", async () => {
    const userId = await insertUser(deployment.context);

    const groupId = await insertGroup(deployment.context, [userId], {
      source: "idp",
      externalId: `group-${userId}`,
    });

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const assignmentId = await assignRole(deployment.context, {
      roleId,
      principal: { type: "group", id: groupId },
    });

    expect(await can(request(userId), "fixture:use")).toBe(true);

    await deployment.context.db.$client.query(
      'update "group" set archived_at = now() where id = $1',
      [groupId]
    );

    expect(await can(request(userId), "fixture:use")).toBe(false);

    const kept = await deployment.context.db.$client.query(
      "select id from role_assignment where id = $1",
      [assignmentId]
    );

    expect(kept.rowCount).toBe(1);

    await deployment.context.db.$client.query(
      'update "group" set archived_at = null where id = $1',
      [groupId]
    );

    expect(await can(request(userId), "fixture:use")).toBe(true);
  });

  it("lets only an unlimited break-glass account bypass", async () => {
    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
      mustChangePassword: false,
      twoFactorEnabled: true,
    });

    const ordinary = await insertUser(deployment.context, {
      role: "admin",
      twoFactorEnabled: true,
    });

    expect(await can(request(breakGlass), "fixture:admin", RECORD)).toBe(true);
    expect(await scopesFor(request(breakGlass), "fixture:read")).toEqual({
      kind: "all",
    });
    expect(await can(request(ordinary), "fixture:admin")).toBe(false);
  });

  it("refuses a limited break-glass session in can() and in a module router", async () => {
    const mustChange = await insertUser(deployment.context, {
      isBreakGlass: true,
      mustChangePassword: true,
      twoFactorEnabled: true,
    });

    const notEnrolled = await insertUser(deployment.context, {
      isBreakGlass: true,
      mustChangePassword: false,
      twoFactorEnabled: false,
    });

    for (const userId of [mustChange, notEnrolled]) {
      // Each person's refusal is its own request; the loop reads them one after the other.
      // oxlint-disable-next-line no-await-in-loop
      expect(await can(request(userId), "fixture:use")).toBe(false);
      // oxlint-disable-next-line no-await-in-loop
      expect(await scopesFor(request(userId), "fixture:use")).toEqual({
        kind: "none",
      });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        fixtureRouter
          .createCaller({ tenant: deployment.context, caller: request(userId) })
          .home()
      ).rejects.toThrow("FORBIDDEN");
    }
  });

  it("refuses an anonymous request without reading assignments", async () => {
    const pool = countingPool();

    const anonymous = createRequestPrincipal(
      { userId: "anonymous", groups: [] },
      createGrantReader(pool.counting, undefined, permissionCatalogue(modules)),
      createRecordResolver(modules, deployment.context)
    );

    expect(await can(anonymous, "fixture:use")).toBe(false);
    expect(pool.queries()).toBe(0);
  });

  it("seeds the six core keys and the two system roles without overwriting a changed array", async () => {
    const roles = await deployment.context.db.$client.query<{
      name: string;
      permissions: string[];
      is_system: boolean;
    }>(
      "select name, permissions, is_system from role where name in ('Tenant administrator', 'Auditor', 'Fixture user') order by name"
    );

    expect(roles.rows.map((row) => [row.name, row.is_system])).toEqual([
      ["Auditor", true],
      ["Fixture user", true],
      ["Tenant administrator", true],
    ]);
    expect(roles.rows[0]?.permissions).toEqual(["core:audit:read"]);
    expect(await tenantAdministratorKeys()).toEqual(
      expect.arrayContaining([...CORE_PERMISSION_KEYS])
    );

    await deployment.context.db.$client.query(
      "update role set permissions = array['core:audit:read', 'fixture:read'] where name = 'Auditor'"
    );
    await seedRoles(deployment.context, modules);

    const after = await deployment.context.db.$client.query<{
      permissions: string[];
      count: number;
    }>(
      "select permissions, (select count(*)::int from role where name = 'Auditor') as count from role where name = 'Auditor'"
    );

    expect(after.rows[0]).toEqual({
      permissions: ["core:audit:read", "fixture:read"],
      count: 1,
    });
  });

  it("appends the module admin key to Tenant administrator on enable and removes it on disable", async () => {
    expect(await tenantAdministratorKeys()).toContain("fixture:admin");

    await setModuleEnabled(deployment.context, modules, "fixture", false);

    expect(await tenantAdministratorKeys()).not.toContain("fixture:admin");
    expect(await tenantAdministratorKeys()).toEqual([...CORE_PERMISSION_KEYS]);

    await setModuleEnabled(deployment.context, modules, "fixture", true);
    await setModuleEnabled(deployment.context, modules, "fixture", true);

    // Only the admin key, once; member use is never added (DEC-23).
    expect(await tenantAdministratorKeys()).toEqual([
      ...CORE_PERMISSION_KEYS,
      "fixture:admin",
    ]);
  });

  it("omits a navigation entry whose permission refuses, and the route behind it still refuses", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:admin",
    ]);

    const caller = request(userId);

    const entries = await permittedNavigation({
      entitlements: deployment.context.entitlements,
      modules,
      caller,
    });

    expect(entries.map((entry) => entry.id)).toEqual(["fixture-admin"]);
    await expect(
      fixtureRouter.createCaller({ tenant: deployment.context, caller }).home()
    ).rejects.toThrow("FORBIDDEN");
  });

  it("sends a person to the landing route only when its entry survives", async () => {
    const user = await insertPersonWith(deployment.context, ["fixture:use"]);
    const none = await insertUser(deployment.context);

    const permitted = await permittedNavigation({
      entitlements: deployment.context.entitlements,
      modules,
      caller: request(user.userId),
    });

    const nothing = await permittedNavigation({
      entitlements: deployment.context.entitlements,
      modules,
      caller: request(none),
    });

    expect(landingRoute(permitted)).toBe("/fixture");
    expect(nothing).toEqual([]);
    expect(landingRoute(nothing)).toBeUndefined();
    await expect(
      fixtureRouter
        .createCaller({
          tenant: deployment.context,
          caller: request(user.userId),
        })
        .home()
    ).resolves.toBe("home");
  });
});
