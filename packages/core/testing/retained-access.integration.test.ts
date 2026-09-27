import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { permittedNavigation } from "../src/lib/entitlement/index.ts";
import { createModuleTRPC } from "../src/lib/entitlement/module-trpc.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import {
  TENANT_ADMINISTRATOR_ROLE,
  can,
  principalFor,
  scopesFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { setModuleEnabled } from "../src/services/module-management/index.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The retained-access lifecycle fixture (Spec 2 AC-26, R-33d, CF-MA-10 and CF-MA-11) on one
 * existing database: grants made while the `kept` module is installed, the image without it, the
 * image with it again but disabled, and the explicit enable. Absence is what the image's
 * permission catalogue sees; the omission guard that refuses an unauthorized removal is proved in
 * the module lifecycle suite.
 */
const RECORD = { type: "kept_record", id: "record-1" };

const trpc = createModuleTRPC("kept");

const keptRouter = trpc.router({
  home: trpc.procedure.query(async ({ ctx }) => {
    if (!(await can(ctx.caller, "kept:use"))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return "home";
  }),
});

function fixture(id: string, extra: Partial<Module> = {}): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id, displayName: id },
    schema: { ...validModule.schema, migrationsTable: moduleLedgerTable(id) },
    permissions: [
      { key: `${id}:use`, label: "Use" },
      { key: `${id}:admin`, label: "Administer" },
    ],
    recordTypes: [],
    defaultRoles: [{ name: `${id} user`, permissions: [`${id}:use`] }],
    navigation: {
      pinned: [],
      entries: [
        {
          id: `${id}-home`,
          label: id,
          path: `/${id}`,
          surface: "workspace",
          requiredPermission: `${id}:use`,
        },
      ],
    },
    ...extra,
  };
}

const kept = fixture("kept", { router: keptRouter });

const stays = fixture("stays");

const installed = [kept, stays];

const withoutKept = [stays];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const people: Record<string, string> = {};

let groupAssignment = "";

function request(person: string, modules: readonly Module[]) {
  return principalFor({
    tenant: deployment.context,
    modules,
    userId: people[person],
  });
}

/**
 * A context started after the last entitlement change, so its reader holds no 10 second copy of
 * an earlier state (DEC-46). The caller ends its pool.
 */
function freshTenant() {
  return createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    silentLogger(),
    ["kept", "stays"]
  );
}

async function rows(text: string, values: unknown[] = []) {
  return (await deployment.context.db.$client.query(text, values)).rows;
}

async function identities() {
  return {
    roles: await rows("select id, name, permissions from role order by id"),
    assignments: await rows(
      "select id, role_id, principal_type, principal_id, scope_type, scope_id from role_assignment order by id"
    ),
  };
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(installed);
  const { context } = deployment;

  await enableModules(context, ["kept", "stays"]);
  await seedRoles(context, installed);

  const [keptUser] = await rows("select id from role where name = 'kept user'");
  const keptUserRole = String(keptUser?.id);

  const mixed = await insertRole(context, {
    name: "Mixed",
    permissions: ["kept:use", "stays:use"],
  });

  for (const person of ["direct", "narrow", "mixed"]) {
    // oxlint-disable-next-line no-await-in-loop
    people[person] = await insertUser(context);
  }

  const group = await insertGroup(context, [people.narrow ?? ""]);

  await assignRole(context, {
    roleId: keptUserRole,
    principal: { type: "user", id: people.direct ?? "" },
  });
  groupAssignment = await assignRole(context, {
    roleId: keptUserRole,
    principal: { type: "group", id: group },
    scope: RECORD,
  });
  await assignRole(context, {
    roleId: mixed,
    principal: { type: "user", id: people.mixed ?? "" },
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

describe("retained access across removal and reintroduction", () => {
  let installedIdentities: Awaited<ReturnType<typeof identities>>;

  it("grants while installed", async () => {
    installedIdentities = await identities();

    expect(await can(request("direct", installed), "kept:use")).toBe(true);
    expect(await can(request("narrow", installed), "kept:use", RECORD)).toBe(
      true
    );
    expect(await can(request("mixed", installed), "kept:use")).toBe(true);
  });

  it("grants nothing for the absent module while unrelated keys in a mixed role keep working", async () => {
    expect(await can(request("direct", withoutKept), "kept:use")).toBe(false);
    expect(await can(request("narrow", withoutKept), "kept:use", RECORD)).toBe(
      false
    );
    expect(await scopesFor(request("narrow", withoutKept), "kept:use")).toEqual(
      {
        kind: "none",
      }
    );
    expect(await can(request("mixed", withoutKept), "kept:use")).toBe(false);
    expect(await can(request("mixed", withoutKept), "stays:use")).toBe(true);

    // The identities are retained: every role, array and assignment is where it was.
    expect(await identities()).toEqual(installedIdentities);
  });

  it("lets an unavailable grant be removed while the module is absent", async () => {
    await rows("delete from role_assignment where id = $1", [groupAssignment]);

    expect(await can(request("mixed", withoutKept), "stays:use")).toBe(true);
  });

  it("stays ineffective after reinstall until the module is enabled", async () => {
    // Reintroduction registers the module disabled (DEC-50).
    await setModuleEnabled(deployment.context, installed, "kept", false);

    const direct = request("direct", installed);
    const tenant = freshTenant();

    try {
      await expect(
        keptRouter.createCaller({ tenant, caller: direct }).home()
      ).rejects.toMatchObject({ cause: { code: "module-disabled" } });
      expect(
        await permittedNavigation({
          entitlements: tenant.entitlements,
          modules: installed,
          caller: direct,
        })
      ).toEqual([]);
    } finally {
      await tenant.db.$client.end();
    }
  });

  it("restores only the remaining valid grants on explicit enable", async () => {
    await setModuleEnabled(deployment.context, installed, "kept", true);

    const tenant = freshTenant();

    try {
      await expect(
        keptRouter
          .createCaller({ tenant, caller: request("direct", installed) })
          .home()
      ).resolves.toBe("home");
      await expect(
        keptRouter
          .createCaller({ tenant, caller: request("mixed", installed) })
          .home()
      ).resolves.toBe("home");
    } finally {
      await tenant.db.$client.end();
    }

    // The removed assignment does not come back.
    expect(await can(request("narrow", installed), "kept:use", RECORD)).toBe(
      false
    );
    expect(
      await rows("select id from role_assignment where id = $1", [
        groupAssignment,
      ])
    ).toEqual([]);

    const now = await identities();

    expect(now.assignments).toEqual(
      installedIdentities.assignments.filter(
        (assignment) => assignment.id !== groupAssignment
      )
    );

    const [administrator] = await rows(
      "select permissions from role where name = $1",
      [TENANT_ADMINISTRATOR_ROLE]
    );

    expect(administrator?.permissions).toContain("kept:admin");
    expect(administrator?.permissions).not.toContain("kept:use");
  });
});
