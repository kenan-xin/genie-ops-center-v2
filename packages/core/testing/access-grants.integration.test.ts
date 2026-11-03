import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createRolesRouter,
  principalFor,
  seedRoles,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../src/lib/module-contract/system-roles.ts";
import { ASK_ROW } from "../src/services/roles/grants.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * S2-21 against a real Postgres with the real core history: the Grants catalogue, the recipient
 * picker and the one Grants writer (R-37a, R-38, R-39). Every role comes from the real `roles`
 * seeding, every caller reads its grants through the real loader. Nothing is mocked.
 */
type FixtureModule = Pick<
  Module,
  | "identity"
  | "permissions"
  | "recordTypes"
  | "defaultRoles"
  | "defaultAccessRole"
>;

const modules: readonly FixtureModule[] = [
  {
    identity: {
      id: "fixture",
      displayName: "Fixture",
      version: "0.0.0",
      description: "Fixture work",
    },
    permissions: [
      { key: "fixture:use", label: "Use" },
      { key: "fixture:edit", label: "Edit" },
    ],
    recordTypes: [],
    defaultRoles: [
      { name: "Fixture viewer", permissions: ["fixture:use"] },
      { name: "Fixture editor", permissions: ["fixture:use", "fixture:edit"] },
    ],
    defaultAccessRole: "Fixture editor",
  },
  {
    // Compiled and never switched on: the entitlement reader caches for 10 seconds (DEC-46).
    identity: { id: "dormant", displayName: "Dormant", version: "0.0.0" },
    permissions: [{ key: "dormant:use", label: "Use" }],
    recordTypes: [],
    defaultRoles: [
      { name: "Dormant user", permissions: ["dormant:use"] },
      { name: "Dormant viewer", permissions: ["dormant:use"] },
    ],
    defaultAccessRole: "Dormant user",
  },
  {
    // No default access role: Add has no role to give, so Grants shows no row.
    identity: { id: "headless", displayName: "Headless", version: "0.0.0" },
    permissions: [{ key: "headless:admin", label: "Administer" }],
    recordTypes: [],
    defaultRoles: [{ name: "Headless admin", permissions: ["headless:admin"] }],
  },
];

const historySources: ModuleHistorySource[] = modules.map((module) => ({
  identity: module.identity,
  schema: {
    migrations: () => [],
    migrationsTable: `__drizzle_migrations_${module.identity.id}`,
  },
}));

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** The caller: a custom core role with `core:roles:manage`, and nothing else. */
let adaId: string;

/** The only active administrator that R-38 counts. */
let kimId: string;

let fixtureEditorId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(historySources);
  await enableModules(deployment.context, ["fixture", "headless"]);
  await seedRoles(deployment.context, modules);

  await insertRole(deployment.context, {
    name: "Fixture approver",
    moduleId: "fixture",
    permissions: ["fixture:use"],
  });

  const accessManager = await insertRole(deployment.context, {
    name: "Access manager",
    permissions: ["core:roles:manage"],
  });

  adaId = await insertUser(deployment.context, { name: "Ada" });
  await assignRole(deployment.context, {
    roleId: accessManager,
    principal: { type: "user", id: adaId },
  });

  kimId = await insertUser(deployment.context, { name: "Kim" });
  await assignRole(deployment.context, {
    roleId: await roleIdOf(TENANT_ADMINISTRATOR_ROLE),
    principal: { type: "user", id: kimId },
  });

  fixtureEditorId = await roleIdOf("Fixture editor");
}, 180000);

afterAll(async () => {
  await deployment?.stop();
});

async function roleIdOf(name: string): Promise<string> {
  const result = await deployment.context.db.$client.query<{ id: string }>(
    "select id::text as id from role where name = $1",
    [name]
  );

  const id = result.rows[0]?.id;

  if (id === undefined) throw new Error(`no role ${name}`);

  return id;
}

function roles(userId: string) {
  return callProcedure(createRolesRouter(modules), {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules,
      userId,
      authenticated: true,
    }),
  });
}

describe("the Grants reads", () => {
  it("lists the catalogue rows and each role choice in order", async () => {
    const rows = await roles(adaId).grantCatalogue();

    expect(
      rows.map((row) => [
        row.id,
        row.enabled,
        row.roles.map((role) => role.name),
      ])
    ).toEqual([
      ["dormant", false, ["Dormant user", "Dormant viewer"]],
      [
        "fixture",
        true,
        ["Fixture editor", "Fixture viewer", "Fixture approver"],
      ],
      [ASK_ROW, true, ["Ask user"]],
    ]);
    expect(rows[1]?.defaultRoleId).toBe(fixtureEditorId);
  });

  it("offers groups that are not archived and people without the break-glass account", async () => {
    const first = await insertUser(deployment.context);
    const second = await insertUser(deployment.context);

    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
    });

    const erased = await insertUser(deployment.context, {
      erasedAt: new Date(),
    });

    const team = await insertGroup(deployment.context, [
      first,
      second,
      breakGlass,
    ]);

    const archived = await insertGroup(deployment.context, [], {
      archivedAt: new Date(),
    });

    const { groups, people } = await roles(adaId).grantRecipients();

    expect(groups).toContainEqual(
      expect.objectContaining({ id: team, memberCount: 2 })
    );
    expect(groups.map((group) => group.id)).not.toContain(archived);
    expect(people.map((person) => person.id)).toEqual(
      expect.arrayContaining([first, second, adaId, kimId])
    );
    expect(people.map((person) => person.id)).not.toContain(breakGlass);
    expect(people.map((person) => person.id)).not.toContain(erased);
  });

  it.each([
    ["holds the key only at a scope", true],
    ["holds only a module key", false],
  ])("refuses a caller who %s", async (_label, scoped) => {
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

    await expect(roles(reader).grantCatalogue()).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(roles(reader).grantRecipients()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
