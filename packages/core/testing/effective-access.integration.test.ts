import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createGroupsRouter,
  createRolesRouter,
  principalFor,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../src/lib/module-contract/system-roles.ts";
import { user } from "../src/schema.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * S2-19 against a real Postgres with the real core history: the read of every path through which
 * a person or a group holds a role (A8, R-37d). Every row is a real `role_assignment` row, and
 * every caller reads its grants through the real loader. Nothing is mocked.
 */
type FixtureModule = Pick<
  Module,
  "identity" | "permissions" | "recordTypes" | "defaultRoles"
>;

function fixture(
  id: string,
  displayName: string,
  keys: readonly FixtureModule["permissions"][number]["key"][]
): FixtureModule {
  return {
    identity: { id, displayName, version: "0.0.0" },
    permissions: keys.map((key) => ({ key, label: key })),
    recordTypes: [],
    defaultRoles: [],
  };
}

const modules = [
  fixture("fixture", "Fixture", ["fixture:use", "fixture:read"]),
  // Compiled and never switched on.
  fixture("dormant", "Sleeping module", ["dormant:use"]),
  fixture("opened", "Opened", ["opened:use", "opened:admin"]),
  fixture("paging", "Paging", ["paging:use"]),
];

const historySources: ModuleHistorySource[] = modules.map((module) => ({
  identity: module.identity,
  schema: {
    migrations: () => [],
    migrationsTable: `__drizzle_migrations_${module.identity.id}`,
  },
}));

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let adminId: string;

let viewerRoleId: string;

let dormantRoleId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(historySources);
  await enableModules(deployment.context, ["fixture", "opened", "paging"]);

  const adminRoleId = await insertRole(deployment.context, {
    name: TENANT_ADMINISTRATOR_ROLE,
    permissions: ["core:groups:manage", "core:roles:manage"],
    isSystem: true,
  });

  adminId = await insertUser(deployment.context, { name: "Ada Admin" });
  await assignRole(deployment.context, {
    roleId: adminRoleId,
    principal: { type: "user", id: adminId },
  });

  viewerRoleId = await insertRole(deployment.context, {
    name: "Fixture viewer",
    moduleId: "fixture",
    permissions: ["fixture:use", "fixture:read"],
    isSystem: true,
  });
  dormantRoleId = await insertRole(deployment.context, {
    name: "Dormant user",
    moduleId: "dormant",
    permissions: ["dormant:use"],
    isSystem: true,
  });
}, 180000);

afterAll(async () => {
  await deployment?.stop();
});

function caller(userId: string) {
  return principalFor({
    tenant: deployment.context,
    modules,
    userId,
    authenticated: true,
  });
}

function roles(userId: string) {
  return callProcedure(createRolesRouter(modules), {
    tenant: deployment.context,
    caller: caller(userId),
  });
}

function groups(userId: string) {
  return callProcedure(createGroupsRouter(), {
    tenant: deployment.context,
    caller: caller(userId),
  });
}

/** One assignment, written as the admin wrote it. */
function grant(
  roleId: string,
  principal: { readonly type: "user" | "group"; readonly id: string },
  scope?: { readonly type: string; readonly id: string }
) {
  return assignRole(deployment.context, {
    roleId,
    principal,
    scope,
    createdBy: adminId,
  });
}

function readOf(principalType: "user" | "group", principalId: string) {
  return roles(adminId).recipientAccess({ principalType, principalId });
}

describe("the effective-access read of one recipient", () => {
  it("returns the direct path and the path of each group of a person, with role, module, scope and adder", async () => {
    const person = await insertUser(deployment.context);
    const first = await insertGroup(deployment.context, [person]);
    const second = await insertGroup(deployment.context, [person]);

    await grant(viewerRoleId, { type: "group", id: first });
    await grant(viewerRoleId, { type: "group", id: second });
    await grant(
      viewerRoleId,
      { type: "user", id: person },
      { type: "fixture_record", id: "r1" }
    );

    const paths = await readOf("user", person);

    const byHolder = paths.toSorted((a, b) =>
      a.holder.id.localeCompare(b.holder.id)
    );

    const expected = [
      { type: "group", id: first, scope: null },
      { type: "group", id: second, scope: null },
      {
        type: "user",
        id: person,
        scope: { type: "fixture_record", id: "r1" },
      },
    ].toSorted((a, b) => a.id.localeCompare(b.id));

    expect(byHolder).toHaveLength(3);
    expect(byHolder).toEqual(
      expected.map((row) =>
        expect.objectContaining({
          holder: expect.objectContaining({ type: row.type, id: row.id }),
          role: expect.objectContaining({
            id: viewerRoleId,
            name: "Fixture viewer",
            kind: "system",
            moduleId: "fixture",
          }),
          scope: row.scope,
          addedBy: { id: adminId, name: "Ada Admin" },
          notInEffect: [],
        })
      )
    );

    const ofGroup = await readOf("group", first);

    expect(ofGroup.map((path) => path.holder)).toEqual([
      expect.objectContaining({ type: "group", id: first }),
    ]);
  });

  it("drops the path of a group that the person left", async () => {
    const person = await insertUser(deployment.context);
    const first = await insertGroup(deployment.context, [person]);
    const second = await insertGroup(deployment.context, [person]);

    await grant(viewerRoleId, { type: "group", id: first });
    await grant(viewerRoleId, { type: "group", id: second });
    await groups(adminId).removeMembers({
      groupId: second,
      userIds: [person],
    });

    const paths = await readOf("user", person);

    expect(paths.map((path) => path.holder.id)).toEqual([first]);
  });

  it("flags a path that grants nothing now: an archived group, a switched-off module, a disabled person", async () => {
    const person = await insertUser(deployment.context);

    const archived = await insertGroup(deployment.context, [person], {
      archivedAt: new Date(),
    });

    await grant(viewerRoleId, { type: "group", id: archived });

    await grant(dormantRoleId, { type: "user", id: person });
    await grant(viewerRoleId, { type: "user", id: person });

    const flags = async () =>
      Object.fromEntries(
        (await readOf("user", person)).map((path) => [
          `${path.holder.type} ${path.role.name}`,
          path.notInEffect,
        ])
      );

    expect(await flags()).toEqual({
      "group Fixture viewer": ["group-archived"],
      "user Dormant user": ["module-off"],
      "user Fixture viewer": [],
    });

    await deployment.context.db
      .update(user)
      .set({ banned: true })
      .where(eq(user.id, person));

    expect(await flags()).toEqual({
      "group Fixture viewer": ["group-archived", "person-disabled"],
      "user Dormant user": ["person-disabled", "module-off"],
      "user Fixture viewer": ["person-disabled"],
    });
  });

  it("never names the break-glass account, as the recipient or as the one who added a path", async () => {
    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
    });

    await expect(readOf("user", breakGlass)).rejects.toMatchObject({
      code: "not-found",
    });

    const person = await insertUser(deployment.context);

    await assignRole(deployment.context, {
      roleId: viewerRoleId,
      principal: { type: "user", id: person },
      createdBy: breakGlass,
    });

    const [path] = await readOf("user", person);

    expect(path?.addedBy).toBeNull();
  });

  it.each([
    { holds: "no core:roles:manage", scoped: false },
    { holds: "core:roles:manage only at a scope", scoped: true },
  ])("refuses a caller who holds $holds", async ({ scoped }) => {
    const someone = await insertUser(deployment.context);
    const reader = await insertUser(deployment.context);
    const scopeGroup = await insertGroup(deployment.context, []);

    const roleId = await insertRole(deployment.context, {
      permissions: scoped ? ["core:roles:manage"] : ["fixture:use"],
    });

    await assignRole(deployment.context, {
      roleId,
      principal: { type: "user", id: reader },
      scope: scoped ? { type: "group", id: scopeGroup } : undefined,
    });

    await expect(
      roles(reader).recipientAccess({
        principalType: "user",
        principalId: someone,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
