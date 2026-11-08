import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createPeopleRouter,
  principalFor,
  seedRoles,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  ASK_USER_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../src/lib/module-contract/system-roles.ts";
import {
  assignRole,
  enableModules,
  insertPersonWith,
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

  // One active administrator, so that a removal passes the R-38 check.
  await assignRole(deployment.context, {
    roleId: roleId(TENANT_ADMINISTRATOR_ROLE),
    principal: { type: "user", id: await insertUser(deployment.context) },
  });

  ({ userId: actorId } = await insertPersonWith(deployment.context, [
    "core:people:manage",
    "core:roles:manage",
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

function people() {
  return callProcedure(createPeopleRouter(modules), {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules,
      userId: actorId,
      authenticated: true,
    }),
  });
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
