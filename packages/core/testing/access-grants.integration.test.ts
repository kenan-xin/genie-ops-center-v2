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
      {
        name: "Fixture viewer",
        description: "Use the fixture.",
        permissions: ["fixture:use"],
      },
      {
        name: "Fixture editor",
        description: "Use the fixture.",
        permissions: ["fixture:use", "fixture:edit"],
      },
    ],
    defaultAccessRole: "Fixture editor",
  },
  {
    // Compiled and never switched on: the entitlement reader caches for 10 seconds (DEC-46).
    identity: { id: "dormant", displayName: "Dormant", version: "0.0.0" },
    permissions: [{ key: "dormant:use", label: "Use" }],
    recordTypes: [],
    defaultRoles: [
      {
        name: "Dormant user",
        description: "Use the fixture.",
        permissions: ["dormant:use"],
      },
      {
        name: "Dormant viewer",
        description: "Use the fixture.",
        permissions: ["dormant:use"],
      },
    ],
    defaultAccessRole: "Dormant user",
  },
  {
    // No default access role: Add has no role to give, so Grants shows no row.
    identity: { id: "headless", displayName: "Headless", version: "0.0.0" },
    permissions: [{ key: "headless:admin", label: "Administer" }],
    recordTypes: [],
    defaultRoles: [
      {
        name: "Headless admin",
        description: "Use the fixture.",
        permissions: ["headless:admin"],
      },
    ],
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
    await expect(
      roles(reader).saveGrants({
        principalType: "user",
        principalId: reader,
        add: [{ row: "fixture", roleId: fixtureEditorId }],
        change: [],
        remove: [],
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await directRoles({ type: "user", id: reader })).toHaveLength(1);
  });
});

type Principal = { readonly type: "user" | "group"; readonly id: string };

/** The recipient's own assignments, by role name: the rows a Grants save may change. */
async function directRoles(principal: Principal) {
  const result = await deployment.context.db.$client.query<{
    readonly id: string;
    readonly name: string;
    readonly scoped: boolean;
  }>(
    `select a.id::text as id, r.name, a.scope_type is not null as scoped
       from role_assignment a join role r on r.id = a.role_id
      where a.principal_type = $1 and a.principal_id = $2
      order by r.name, a.id`,
    [principal.type, principal.id]
  );

  return result.rows;
}

async function namesOf(principal: Principal) {
  return (await directRoles(principal)).map((row) => row.name);
}

function grantTo(
  roleName: string,
  principal: Principal,
  scope?: { readonly type: string; readonly id: string }
) {
  return roleIdOf(roleName).then((roleId) =>
    assignRole(deployment.context, { roleId, principal, scope })
  );
}

function save(
  recipient: Principal,
  changes: {
    readonly add?: readonly { row: string; roleId: string }[];
    readonly change?: readonly {
      row: string;
      assignmentId: string;
      roleId: string;
    }[];
    readonly remove?: readonly { row: string }[];
  }
) {
  return roles(adaId).saveGrants({
    principalType: recipient.type,
    principalId: recipient.id,
    add: [...(changes.add ?? [])],
    change: [...(changes.change ?? [])],
    remove: [...(changes.remove ?? [])],
  });
}

describe("the Grants writer", () => {
  it("Add writes the default access role", async () => {
    const group: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, []),
    };

    const rows = await roles(adaId).grantCatalogue();

    await save(group, {
      add: rows
        .filter((row) => row.id === "fixture" || row.id === ASK_ROW)
        .map((row) => ({ row: row.id, roleId: row.defaultRoleId ?? "" })),
    });

    expect(await directRoles(group)).toEqual([
      expect.objectContaining({ name: "Ask user", scoped: false }),
      expect.objectContaining({ name: "Fixture editor", scoped: false }),
    ]);
  });

  it("a swap replaces the shown role", async () => {
    const viewerId = await roleIdOf("Fixture viewer");

    const first: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, []),
    };

    const shown = await grantTo("Fixture editor", first);

    await save(first, {
      change: [{ row: "fixture", assignmentId: shown, roleId: viewerId }],
    });

    expect(await namesOf(first)).toEqual(["Fixture viewer"]);

    const second: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, []),
    };

    const editor = await grantTo("Fixture editor", second);

    await grantTo("Fixture viewer", second);
    await save(second, {
      change: [{ row: "fixture", assignmentId: editor, roleId: viewerId }],
    });

    expect(await namesOf(second)).toEqual(["Fixture viewer"]);
  });

  it("Remove takes every role of the row", async () => {
    const person: Principal = {
      type: "user",
      id: await insertUser(deployment.context),
    };

    const team: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, [person.id]),
    };

    const removed = [
      await grantTo("Fixture editor", person),
      await grantTo("Fixture approver", person),
      await grantTo("Fixture viewer", person, {
        type: "fixture_record",
        id: "r1",
      }),
    ];

    await grantTo("Ask user", person);
    await grantTo("Fixture viewer", team);
    await save(person, { remove: [{ row: "fixture" }] });

    expect(await namesOf(person)).toEqual(["Ask user"]);
    expect(await namesOf(team)).toEqual(["Fixture viewer"]);

    const audit = await deployment.context.db.$client.query<{
      readonly targetId: string;
    }>(
      `select target_id as "targetId" from audit_event
        where action = 'core:role_assignment_removed' and target_id = any($1::text[])`,
      [removed]
    );

    expect(audit.rows.map((row) => row.targetId).toSorted()).toEqual(
      removed.toSorted()
    );
  });

  it("keeps a member group's path out of a person's save", async () => {
    const person: Principal = {
      type: "user",
      id: await insertUser(deployment.context),
    };

    const team: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, [person.id]),
    };

    const teamPath = await grantTo("Fixture viewer", team);

    await grantTo("Fixture editor", person);

    const paths = await roles(adaId).recipientAccess({
      principalType: "user",
      principalId: person.id,
    });

    expect(paths.map((path) => path.holder.type).toSorted()).toEqual([
      "group",
      "user",
    ]);
    await expect(
      save(person, {
        change: [
          { row: "fixture", assignmentId: teamPath, roleId: fixtureEditorId },
        ],
      })
    ).rejects.toMatchObject({ code: "not-found" });
    expect(await namesOf(team)).toEqual(["Fixture viewer"]);
  });

  it("refuses a change outside its row and writes nothing", async () => {
    const person: Principal = {
      type: "user",
      id: await insertUser(deployment.context),
    };

    const other: Principal = {
      type: "group",
      id: await insertGroup(deployment.context, []),
    };

    const breakGlass: Principal = {
      type: "user",
      id: await insertUser(deployment.context, { isBreakGlass: true }),
    };

    await grantTo("Fixture editor", person);

    const ask = await grantTo("Ask user", person);
    const foreign = await grantTo("Fixture editor", other);
    const viewerId = await roleIdOf("Fixture viewer");
    const before = await directRoles(person);

    const refusals: readonly [Principal, Parameters<typeof save>[1], string][] =
      [
        [
          person,
          {
            change: [
              { row: "fixture", assignmentId: foreign, roleId: viewerId },
            ],
          },
          "not-found",
        ],
        [
          person,
          {
            change: [{ row: "fixture", assignmentId: ask, roleId: viewerId }],
          },
          "not-found",
        ],
        [
          person,
          {
            add: [{ row: "fixture", roleId: await roleIdOf("Dormant user") }],
          },
          "not-found",
        ],
        [
          person,
          {
            add: [{ row: "fixture", roleId: viewerId }],
            remove: [{ row: "fixture" }],
          },
          "invalid-input",
        ],
        [person, { add: [{ row: "nope", roleId: viewerId }] }, "not-found"],
        [
          breakGlass,
          { add: [{ row: "fixture", roleId: fixtureEditorId }] },
          "not-found",
        ],
      ];

    for (const [recipient, changes, code] of refusals) {
      // One refusal at a time, so each answer is read on its own.
      // oxlint-disable-next-line no-await-in-loop
      await expect(save(recipient, changes)).rejects.toMatchObject({ code });
    }

    expect(await directRoles(person)).toEqual(before);
    expect(await namesOf(other)).toEqual(["Fixture editor"]);
    expect(await directRoles(breakGlass)).toEqual([]);
  });
});

/** Bans the only counted administrator, so R-38 sees none left. */
function banKim(banned: boolean) {
  return deployment.context.db.$client.query(
    `update "user" set banned = $1 where id = $2`,
    [banned, kimId]
  );
}

async function newGroup(): Promise<Principal> {
  return { type: "group", id: await insertGroup(deployment.context, []) };
}

describe("the Grants guards", () => {
  it("refuses an Add on a switched-off module and writes no other Add", async () => {
    const group = await newGroup();

    await expect(
      save(group, {
        add: [
          { row: "fixture", roleId: fixtureEditorId },
          { row: "dormant", roleId: await roleIdOf("Dormant user") },
        ],
      })
    ).rejects.toMatchObject({ code: "module-disabled" });

    expect(await namesOf(group)).toEqual([]);
  });

  it("refuses a swap on a switched-off module", async () => {
    const group = await newGroup();

    const shown = await grantTo("Dormant user", group);

    await expect(
      save(group, {
        change: [
          {
            row: "dormant",
            assignmentId: shown,
            roleId: await roleIdOf("Dormant viewer"),
          },
        ],
      })
    ).rejects.toMatchObject({ code: "module-disabled" });

    expect(await namesOf(group)).toEqual(["Dormant user"]);
  });

  it("lets Remove take the roles of a switched-off module", async () => {
    const group = await newGroup();

    await grantTo("Dormant user", group);
    await save(group, { remove: [{ row: "dormant" }] });

    expect(await namesOf(group)).toEqual([]);
  });

  it("Remove of Ask never takes Tenant administrator", async () => {
    const group = await newGroup();

    await grantTo(TENANT_ADMINISTRATOR_ROLE, group);
    await grantTo("Ask user", group);
    await save(group, { remove: [{ row: ASK_ROW }] });

    expect(await namesOf(group)).toEqual([TENANT_ADMINISTRATOR_ROLE]);
  });

  it("refuses a save that leaves no active administrator", async () => {
    const group = await newGroup();

    await grantTo("Fixture editor", group);

    await banKim(true);

    try {
      await expect(
        save(group, { remove: [{ row: "fixture" }] })
      ).rejects.toMatchObject({ code: "last-administrator" });
    } finally {
      await banKim(false);
    }

    expect(await namesOf(group)).toEqual(["Fixture editor"]);
  });
});
