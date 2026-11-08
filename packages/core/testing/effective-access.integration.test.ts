import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createGroupsRouter,
  createPeopleRouter,
  createRolesRouter,
  principalFor,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../src/lib/module-contract/system-roles.ts";
import { roleAssignment, user } from "../src/schema.ts";
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

function peopleRpc(userId: string) {
  return callProcedure(createPeopleRouter(modules), {
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

describe("the person read of the People inspector", () => {
  it("lets core:people:manage alone read one person's paths and the catalogue, and nothing else of Access", async () => {
    const managerRoleId = await insertRole(deployment.context, {
      name: `People manager ${Date.now()}`,
      permissions: ["core:people:manage"],
    });

    const manager = await insertUser(deployment.context);

    await grant(managerRoleId, { type: "user", id: manager });

    const person = await insertUser(deployment.context);
    const team = await insertGroup(deployment.context, [person]);

    await grant(viewerRoleId, { type: "user", id: person });
    await grant(viewerRoleId, { type: "group", id: team });

    const access = await peopleRpc(manager).access({ personId: person });

    expect(access.paths.map((path) => path.holder.type).toSorted()).toEqual([
      "group",
      "user",
    ]);
    expect(access.catalogue).toEqual(await roles(adminId).grantCatalogue());

    await expect(
      roles(manager).accessBySubject({
        subject: { type: "module", id: "fixture" },
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      roles(manager).recipientAccess({
        principalType: "user",
        principalId: person,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      roles(manager).saveGrants({
        principalType: "user",
        principalId: person,
        add: [],
        change: [],
        remove: [{ row: "fixture" }],
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    // The Roles key alone does not open the person read.
    await expect(
      peopleRpc(adminId).access({ personId: person })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

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

    await expect(
      roles(reader).accessBySubject({
        subject: { type: "module", id: "fixture" },
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the paged effective-access read by subject", () => {
  it("lists every role that opens the module, an older custom role included, and no role that only administers it", async () => {
    const openedUser = await insertRole(deployment.context, {
      name: "Opened user",
      moduleId: "opened",
      permissions: ["opened:use"],
      isSystem: true,
    });

    const olderOpener = await insertRole(deployment.context, {
      name: "Older opener",
      permissions: ["core:audit:read", "opened:use"],
    });

    const administration = await insertRole(deployment.context, {
      name: "Opened administration",
      permissions: ["opened:admin"],
    });

    const x = await insertUser(deployment.context);
    const y = await insertUser(deployment.context);
    const z = await insertUser(deployment.context);
    const team = await insertGroup(deployment.context, []);

    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
    });

    await grant(openedUser, { type: "user", id: x });
    await grant(openedUser, { type: "group", id: team });
    await grant(olderOpener, { type: "user", id: y });
    await grant(administration, { type: "user", id: z });
    await grant(openedUser, { type: "user", id: breakGlass });

    const page = await roles(adminId).accessBySubject({
      subject: { type: "module", id: "opened" },
    });

    expect(page.total).toBe(3);
    expect(page.paths.map((path) => path.holder.id).toSorted()).toEqual(
      [x, team, y].toSorted()
    );
  });

  it("reads every holder of one role, a core role included, and a malformed role id as no holder", async () => {
    const auditorLike = await insertRole(deployment.context, {
      name: "Auditor like",
      permissions: ["core:audit:read"],
      isSystem: true,
    });

    const person = await insertUser(deployment.context);
    const team = await insertGroup(deployment.context, [person]);

    await grant(auditorLike, { type: "user", id: person });
    await grant(auditorLike, { type: "group", id: team });
    await grant(viewerRoleId, { type: "user", id: person });

    const page = await roles(adminId).accessBySubject({
      subject: { type: "role", id: auditorLike },
    });

    expect(page.paths.map((path) => path.role.id)).toEqual([
      auditorLike,
      auditorLike,
    ]);
    expect(page.paths.map((path) => path.holder.type).toSorted()).toEqual([
      "group",
      "user",
    ]);
    expect(page.total).toBe(2);

    expect(
      await roles(adminId).accessBySubject({
        subject: { type: "role", id: "not-a-uuid" },
      })
    ).toEqual({ paths: [], total: 0, nextCursor: null });
  });

  it("pages paths written in one statement without a skip or a repeat, and counts them on the first page", async () => {
    const pagingUser = await insertRole(deployment.context, {
      name: "Paging user",
      moduleId: "paging",
      permissions: ["paging:use"],
      isSystem: true,
    });

    const people = [
      await insertUser(deployment.context),
      await insertUser(deployment.context),
      await insertUser(deployment.context),
    ];

    // One statement, so the three rows share one `created_at` (as Add person writes them).
    const written = await deployment.context.db
      .insert(roleAssignment)
      .values(
        people.map((id) => ({
          roleId: pagingUser,
          principalType: "user",
          principalId: id,
        }))
      )
      .returning({ id: roleAssignment.id });

    const subject = { type: "module", id: "paging" } as const;

    const first = await roles(adminId).accessBySubject({ subject, limit: 2 });

    expect(first.paths).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await roles(adminId).accessBySubject({
      subject,
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(second.paths).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.paths, ...second.paths]
        .map((path) => path.assignmentId)
        .toSorted()
    ).toEqual(written.map((row) => row.id).toSorted());
  });

  it("searches by holder, role and module name before it pages, and counts only the matches", async () => {
    const person = await insertUser(deployment.context);

    const team = await insertGroup(deployment.context, [person], {
      name: "Search finance team",
    });

    await grant(viewerRoleId, { type: "user", id: person });
    await grant(dormantRoleId, { type: "user", id: person });
    await grant(viewerRoleId, { type: "group", id: team });

    const search = (query: string) =>
      roles(adminId).accessBySubject({
        subject: { type: "user", id: person },
        query,
        limit: 1,
      });

    const byHolder = await search("finance team");

    expect(byHolder.total).toBe(1);
    expect(byHolder.paths.map((path) => path.holder.name)).toEqual([
      "Search finance team",
    ]);

    const byModule = await search("sleeping");

    expect(byModule.total).toBe(1);
    expect(byModule.paths.map((path) => path.role.name)).toEqual([
      "Dormant user",
    ]);

    const byRole = await search("viewer");

    expect(byRole.total).toBe(2);
    expect(byRole.paths).toHaveLength(1);
    expect(byRole.nextCursor).not.toBeNull();
  });

  it("flags every path of a switched-off module, and none of Ask, which core owns", async () => {
    const askUser = await insertRole(deployment.context, {
      name: "Overview Ask user",
      permissions: ["core:ask:use"],
      isSystem: true,
    });

    const person = await insertUser(deployment.context);
    const team = await insertGroup(deployment.context, []);

    await grant(askUser, { type: "user", id: person });
    await grant(askUser, { type: "group", id: team });
    await grant(dormantRoleId, { type: "user", id: person });

    const ask = await roles(adminId).accessBySubject({
      subject: { type: "module", id: "core:ask" },
    });

    expect(
      ask.paths
        .filter((path) => [person, team].includes(path.holder.id))
        .map((path) => path.notInEffect)
    ).toEqual([[], []]);

    const dormant = await roles(adminId).accessBySubject({
      subject: { type: "module", id: "dormant" },
    });

    expect(
      dormant.paths.find((path) => path.holder.id === person)?.notInEffect
    ).toEqual(["module-off"]);
  });
});
