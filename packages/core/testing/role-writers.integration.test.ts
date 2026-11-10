import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createGroupsRouter,
  createPeopleRouter,
  createRolesRouter,
  principalFor,
  seedRoles,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  ASK_USER_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../src/lib/module-contract/system-roles.ts";
import { ASK_ROW } from "../src/services/roles/grants.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertPersonWith,
  insertRole,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The role writers against a real Postgres with the real core history (R-40, R-37a, `d8l5.44`).
 * Every role comes from the real `roles` seeding and every write goes through the shipped router,
 * so a crafted request meets the same check as the screen. Nothing is mocked.
 */
type FixtureModule = Pick<
  Module,
  | "identity"
  | "permissions"
  | "recordTypes"
  | "defaultRoles"
  | "defaultAccessRole"
>;

const on: FixtureModule = {
  identity: { id: "on", displayName: "On", version: "0.0.0" },
  permissions: [
    { key: "on:use", label: "Use" },
    { key: "on:read", label: "Read" },
  ],
  recordTypes: [],
  defaultRoles: [
    {
      name: "On viewer",
      description: "Read the fixture.",
      permissions: ["on:use", "on:read"],
    },
    {
      name: "On user",
      description: "Use the fixture.",
      permissions: ["on:use"],
    },
  ],
  defaultAccessRole: "On viewer",
};

// Compiled and never switched on: the entitlement reader caches for 10 seconds (DEC-46).
const off: FixtureModule = {
  identity: { id: "off", displayName: "Off", version: "0.0.0" },
  permissions: [{ key: "off:use", label: "Use" }],
  recordTypes: [],
  defaultRoles: [
    {
      name: "Off user",
      description: "Use the fixture.",
      permissions: ["off:use"],
    },
  ],
  defaultAccessRole: "Off user",
};

const modules = [on, off];

const historySources: ModuleHistorySource[] = modules.map((module) => ({
  identity: module.identity,
  schema: {
    migrations: () => [],
    migrationsTable: `__drizzle_migrations_${module.identity.id}`,
  },
}));

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const roleIds = new Map<string, string>();

let actorId: string;

let groupId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(historySources);
  await markSetupDone(deployment.context);
  // Before any read, so the entitlement cache never holds `on` as off.
  await enableModules(deployment.context, ["on"]);
  await seedRoles(deployment.context, modules);

  const seeded = await deployment.context.db.$client.query<{
    readonly id: string;
    readonly name: string;
  }>("select id::text as id, name from role");

  for (const row of seeded.rows) roleIds.set(row.name, row.id);

  // A system role of a module that this image does not compile, so no entitlement row exists.
  roleIds.set(
    "Gone user",
    await insertRole(deployment.context, {
      name: "Gone user",
      moduleId: "gone",
      isSystem: true,
      permissions: ["gone:use"],
    })
  );

  groupId = await insertGroup(deployment.context, []);

  // One active administrator, so that a removal passes the R-38 check.
  await assignRole(deployment.context, {
    roleId: roleId(TENANT_ADMINISTRATOR_ROLE),
    principal: { type: "user", id: await insertUser(deployment.context) },
  });

  ({ userId: actorId } = await insertPersonWith(deployment.context, [
    "core:people:manage",
    "core:roles:manage",
    "core:groups:manage",
  ]));
}, 180000);

afterAll(async () => {
  await deployment?.stop();
});

function roleId(name: string): string {
  const id = roleIds.get(name);

  if (id === undefined) throw new Error(`No seeded role ${name}`);

  return id;
}

function caller(userId: string = actorId) {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules,
      userId,
      authenticated: true,
    }),
  };
}

function people(userId?: string) {
  return callProcedure(createPeopleRouter(modules), caller(userId));
}

/** The ids of the Grants rows that the person read returns for one person. */
async function rowsOf(personId: string) {
  return (await people().access({ personId })).catalogue.map((row) => row.id);
}

function roles(userId?: string) {
  return callProcedure(createRolesRouter(modules), caller(userId));
}

/**
 * One grant by `as` through each of the two writers that `d8l5.39` names: `roles.assign` grants
 * `as` itself, and the Groups `assignRole` grants the fixture group.
 */
function grant(writer: string, roleIdToGrant: string, as: string = actorId) {
  return writer === "roles.assign"
    ? roles(as).assign({
        roleId: roleIdToGrant,
        principalType: "user",
        principalId: as,
      })
    : callProcedure(createGroupsRouter(), caller(as)).assignRole({
        groupId,
        roleId: roleIdToGrant,
      });
}

async function assignmentCount(roleIdToCount: string): Promise<number> {
  const result = await deployment.context.db.$client.query<{
    readonly count: number;
  }>(`select count(*)::int as count from role_assignment where role_id = $1`, [
    roleIdToCount,
  ]);

  return result.rows[0]?.count ?? 0;
}

async function roleNamesOf(personId: string): Promise<readonly string[]> {
  const result = await deployment.context.db.$client.query<{
    readonly name: string;
  }>(
    `select r.name from role_assignment a join role r on r.id = a.role_id
      where a.principal_type = 'user' and a.principal_id = $1 order by r.name`,
    [personId]
  );

  return result.rows.map((row) => row.name);
}

async function addedRows(personId: string): Promise<number> {
  const result = await deployment.context.db.$client.query<{
    readonly count: number;
  }>(
    `select count(*)::int as count from audit_event
      where action = 'core:role_assignment_added' and metadata->>'principalId' = $1`,
    [personId]
  );

  return result.rows[0]?.count ?? 0;
}

async function personCount(email: string): Promise<number> {
  const result = await deployment.context.db.$client.query<{
    readonly count: number;
  }>(`select count(*)::int as count from "user" where email = $1`, [email]);

  return result.rows[0]?.count ?? 0;
}

describe("Add person against the Grants rows", () => {
  it("adds a person with one role of a switched-on module and Ask user, each through the one writer", async () => {
    const { id } = await people().add({
      email: "granted@example.invalid",
      roleIds: [roleId("On viewer"), roleId(ASK_USER_ROLE)],
      sendInvitation: false,
    });

    expect(await roleNamesOf(id)).toEqual([ASK_USER_ROLE, "On viewer"]);
    expect(await addedRows(id)).toBe(2);
  });

  it.each([
    [
      "two roles of one module",
      () => [roleId("On viewer"), roleId("On user")],
      "invalid-input",
    ],
    [
      "an administration role",
      () => [roleId(TENANT_ADMINISTRATOR_ROLE)],
      "not-found",
    ],
    [
      "a role of a switched-off module",
      () => [roleId("Off user")],
      "module-disabled",
    ],
  ])("refuses %s and writes no person", async (_name, picks, code) => {
    // One address per row, so that a wrong write does not turn the next row into email-taken.
    const email = `refused-${code}@example.invalid`;

    await expect(
      people().add({ email, roleIds: picks(), sendInvitation: false })
    ).rejects.toMatchObject({ code });
    expect(await personCount(email)).toBe(0);
  });
});

describe("the one writer and a switched-off module (R-37a, d8l5.39)", () => {
  it.each([
    ["roles.assign", "Off user"],
    ["roles.assign", "Gone user"],
    ["the Groups assignRole", "Off user"],
    ["the Groups assignRole", "Gone user"],
  ])(
    "%s refuses %s with module-disabled and writes no assignment",
    async (writer, roleName) => {
      await expect(grant(writer, roleId(roleName))).rejects.toMatchObject({
        code: "module-disabled",
      });
      expect(await assignmentCount(roleId(roleName))).toBe(0);
    }
  );

  it("removes an existing grant of a switched-off module's role (R-33d)", async () => {
    // A fixture insert, as a grant made before the module was switched off.
    const assignmentId = await assignRole(deployment.context, {
      roleId: roleId("Off user"),
      principal: { type: "user", id: await insertUser(deployment.context) },
    });

    await roles().unassign({ assignmentId });

    expect(await assignmentCount(roleId("Off user"))).toBe(0);
  });
});

describe("a scoped Roles manager and the grant writers (d8l5.51)", () => {
  it.each(["roles.assign", "the Groups assignRole"])(
    "%s refuses a caller who holds core:roles:manage only at a scope and writes no assignment",
    async (writer) => {
      const { userId } = await insertPersonWith(
        deployment.context,
        ["core:roles:manage", "core:groups:manage"],
        { type: "group", id: groupId }
      );

      const administrator = roleId(TENANT_ADMINISTRATOR_ROLE);
      const before = await assignmentCount(administrator);

      await expect(grant(writer, administrator, userId)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await assignmentCount(administrator)).toBe(before);
    }
  );

  it("roles.update refuses adding core:roles:manage to a custom core role the scoped caller holds tenant-wide", async () => {
    const { userId } = await insertPersonWith(
      deployment.context,
      ["core:roles:manage"],
      { type: "group", id: groupId }
    );

    const helpdesk = await insertRole(deployment.context, {
      permissions: ["core:people:manage"],
    });

    await assignRole(deployment.context, {
      roleId: helpdesk,
      principal: { type: "user", id: userId },
    });

    await expect(
      roles(userId).update({
        roleId: helpdesk,
        name: "Helpdesk",
        permissions: ["core:people:manage", "core:roles:manage"],
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    const stored = await deployment.context.db.$client.query<{
      readonly permissions: readonly string[];
    }>("select permissions from role where id = $1", [helpdesk]);

    expect(stored.rows[0]?.permissions).toEqual(["core:people:manage"]);
  });

  it("roles.unassign refuses a caller who holds core:roles:manage only at a scope and keeps the assignment", async () => {
    const { userId } = await insertPersonWith(
      deployment.context,
      ["core:roles:manage"],
      { type: "group", id: groupId }
    );

    const onUser = roleId("On user");

    const assignmentId = await assignRole(deployment.context, {
      roleId: onUser,
      principal: { type: "user", id: await insertUser(deployment.context) },
    });

    const before = await assignmentCount(onUser);

    await expect(
      roles(userId).unassign({ assignmentId })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await assignmentCount(onUser)).toBe(before);
  });

  it("groups.addMembers refuses a caller who holds core:groups:manage only at a scope adding itself to a Tenant administrator group", async () => {
    const { userId } = await insertPersonWith(
      deployment.context,
      ["core:groups:manage"],
      { type: "group", id: groupId }
    );

    const administrators = await insertGroup(deployment.context, []);

    await assignRole(deployment.context, {
      roleId: roleId(TENANT_ADMINISTRATOR_ROLE),
      principal: { type: "group", id: administrators },
    });

    await expect(
      callProcedure(createGroupsRouter(), caller(userId)).addMembers({
        groupId: administrators,
        userIds: [userId],
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    const members = await deployment.context.db.$client.query(
      "select 1 from group_member where group_id = $1 and user_id = $2",
      [administrators, userId]
    );

    expect(members.rowCount).toBe(0);
  });
});

describe("roles.assign and the scope rules (d8l5.51)", () => {
  it.each([
    [
      "a core role at a scope",
      "invalid-input",
      () =>
        insertRole(deployment.context, {
          permissions: ["core:roles:manage"],
        }),
    ],
    [
      "a module role at a scope type its module does not declare",
      "invalid-input",
      async () => roleId("On viewer"),
    ],
  ])(
    "refuses %s with %s and writes no assignment",
    async (_label, code, role) => {
      const id = await role();
      const before = await assignmentCount(id);

      await expect(
        roles().assign({
          roleId: id,
          principalType: "user",
          principalId: await insertUser(deployment.context),
          scope: { scopeType: "invoice", scopeId: "inv-1" },
        })
      ).rejects.toMatchObject({ code });
      expect(await assignmentCount(id)).toBe(before);
    }
  );
});

describe("the person read of the People inspector (d8l5.54)", () => {
  it("names only the Grants rows of the person's paths", async () => {
    const person = await insertUser(deployment.context);
    const switchedOff = await insertUser(deployment.context);

    await assignRole(deployment.context, {
      roleId: roleId("On viewer"),
      principal: { type: "user", id: person },
    });
    await assignRole(deployment.context, {
      roleId: roleId(ASK_USER_ROLE),
      principal: { type: "user", id: person },
    });

    // A fixture insert, as a grant made before the module was switched off.
    const offAssignment = await assignRole(deployment.context, {
      roleId: roleId("Off user"),
      principal: { type: "user", id: switchedOff },
    });

    expect(await rowsOf(person)).toEqual(["on", ASK_ROW]);
    expect(await rowsOf(switchedOff)).toEqual(["off"]);

    // The d8l5.39 cases count every Off user row, so the fixture row goes again.
    await deployment.context.db.$client.query(
      "delete from role_assignment where id = $1",
      [offAssignment]
    );
  });

  it("refuses a holder of core:people:manage at a scope that is not the person", async () => {
    const person = await insertUser(deployment.context);

    const { userId } = await insertPersonWith(
      deployment.context,
      ["core:people:manage"],
      { type: "group", id: groupId }
    );

    await expect(
      people(userId).access({ personId: person })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
