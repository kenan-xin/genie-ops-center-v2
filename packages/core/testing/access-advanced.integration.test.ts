import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createRolesRouter,
  principalFor,
  scopesFor,
  seedRoles,
  type ModuleHistorySource,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  ASK_USER_ROLE,
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../src/lib/module-contract/system-roles.ts";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * S2-23 against a real Postgres with the real core history: the Advanced access reads and the one
 * Advanced writer (R-37c, R-38, R-39). Roles come from the real seeding, callers read their grants
 * through the real loader, and every write goes through the one assignment writer. Nothing is
 * mocked.
 */
type FixtureModule = Pick<
  Module,
  | "identity"
  | "permissions"
  | "recordTypes"
  | "defaultRoles"
  | "defaultAccessRole"
>;

const FIXTURE_RECORDS = new Map([
  ["rec-a", "Record A"],
  ["rec-b", "Record B"],
]);

const modules: readonly FixtureModule[] = [
  {
    identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },
    permissions: [
      { key: "fixture:use", label: "Use" },
      { key: "fixture:read", label: "Read" },
    ],
    recordTypes: [
      {
        type: "fixture-record",
        // Refuses an unknown id, so the writer's existence check has something to refuse.
        resolve: async (_ctx, id) => {
          const label = FIXTURE_RECORDS.get(id);

          return label === undefined ? undefined : { label };
        },
        search: async (_ctx, query) =>
          [...FIXTURE_RECORDS].flatMap(([id, label]) =>
            label.toLowerCase().includes(query.toLowerCase()) ? [id] : []
          ),
      },
    ],
    defaultRoles: [
      { name: "Fixture viewer", permissions: ["fixture:use", "fixture:read"] },
      { name: "Fixture editor", permissions: ["fixture:use", "fixture:read"] },
    ],
    defaultAccessRole: "Fixture viewer",
  },
  {
    // Two record types: the picker cannot tell them apart (U3).
    identity: { id: "pair", displayName: "Pair", version: "0.0.0" },
    permissions: [{ key: "pair:use", label: "Use" }],
    recordTypes: [
      {
        type: "pair-one",
        resolve: async () => ({ label: "One" }),
        search: async () => ["p1"],
      },
      {
        type: "pair-two",
        resolve: async () => ({ label: "Two" }),
        search: async () => ["p2"],
      },
    ],
    defaultRoles: [{ name: "Pair user", permissions: ["pair:use"] }],
    defaultAccessRole: "Pair user",
  },
  {
    // Compiled and never switched on: the entitlement reader caches for 10 seconds (DEC-46).
    identity: { id: "dormant", displayName: "Dormant", version: "0.0.0" },
    permissions: [{ key: "dormant:use", label: "Use" }],
    recordTypes: [
      {
        type: "dormant-record",
        resolve: async () => ({ label: "Sleepy" }),
        search: async () => ["d1"],
      },
    ],
    defaultRoles: [{ name: "Dormant user", permissions: ["dormant:use"] }],
    defaultAccessRole: "Dormant user",
  },
  {
    // One record type that never offers a search.
    identity: { id: "plain", displayName: "Plain", version: "0.0.0" },
    permissions: [{ key: "plain:use", label: "Use" }],
    recordTypes: [
      { type: "plain-note", resolve: async () => ({ label: "Note" }) },
    ],
    defaultRoles: [{ name: "Plain user", permissions: ["plain:use"] }],
    defaultAccessRole: "Plain user",
  },
];

const historySources: ModuleHistorySource[] = modules.map((module) => ({
  identity: module.identity,
  schema: {
    migrations: () => [],
    migrationsTable: `__drizzle_migrations_${module.identity.id}`,
  },
}));

type Principal = { readonly type: "user" | "group"; readonly id: string };

type Changes = {
  readonly add?: readonly {
    readonly roleId: string;
    readonly scope: { readonly type: string; readonly id: string } | null;
  }[];
  readonly remove?: readonly { readonly assignmentId: string }[];
};

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** The caller: a custom core role with `core:roles:manage`, and nothing else. */
let adaId: string;

/** The only active administrator that R-38 counts. */
let kimId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(historySources);
  await enableModules(deployment.context, ["fixture", "pair", "plain"]);
  await seedRoles(deployment.context, modules);

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
  await grantTo(TENANT_ADMINISTRATOR_ROLE, { type: "user", id: kimId });
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

function grantTo(
  roleName: string,
  principal: Principal,
  scope?: { readonly type: string; readonly id: string }
) {
  return roleIdOf(roleName).then((roleId) =>
    assignRole(deployment.context, { roleId, principal, scope })
  );
}

/** The recipient's own assignments, by role name. */
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

/** Test cleanup only: drops a principal's `Tenant administrator` rows, so R-38 counts kim alone. */
function dropAdministrator(principal: Principal) {
  return deployment.context.db.$client.query(
    `delete from role_assignment a using role r
      where r.id = a.role_id and r.name = $1 and r.is_system
        and a.principal_type = $2 and a.principal_id = $3`,
    [TENANT_ADMINISTRATOR_ROLE, principal.type, principal.id]
  );
}

/** Bans the only counted administrator, so R-38 sees none left. */
function banKim(banned: boolean) {
  return deployment.context.db.$client.query(
    `update "user" set banned = $1 where id = $2`,
    [banned, kimId]
  );
}

async function newGroup(members: readonly string[] = []): Promise<Principal> {
  return { type: "group", id: await insertGroup(deployment.context, members) };
}

function save(callerId: string, recipient: Principal, changes: Changes) {
  return roles(callerId).saveAdvanced({
    principalType: recipient.type,
    principalId: recipient.id,
    add: [...(changes.add ?? [])],
    remove: [...(changes.remove ?? [])],
  });
}

describe("the Advanced access writer", () => {
  it("A1: adds Tenant administrator and Auditor to a group for the whole tenant, and a later save removes the Auditor", async () => {
    const group = await newGroup();

    try {
      await save(adaId, group, {
        add: [
          { roleId: await roleIdOf(TENANT_ADMINISTRATOR_ROLE), scope: null },
          { roleId: await roleIdOf(AUDITOR_ROLE), scope: null },
        ],
      });

      const added = await directRoles(group);

      expect(added).toEqual([
        expect.objectContaining({ name: AUDITOR_ROLE, scoped: false }),
        expect.objectContaining({
          name: TENANT_ADMINISTRATOR_ROLE,
          scoped: false,
        }),
      ]);

      const auditor = added.find((row) => row.name === AUDITOR_ROLE);

      await save(adaId, group, {
        remove: [{ assignmentId: auditor?.id ?? "" }],
      });

      expect(await namesOf(group)).toEqual([TENANT_ADMINISTRATOR_ROLE]);
    } finally {
      await dropAdministrator(group);
    }
  });

  it("A2: refuses a save that removes the last active Tenant administrator path, and writes nothing", async () => {
    const ann = await insertUser(deployment.context);
    const group = await newGroup([ann]);
    const path = await grantTo(TENANT_ADMINISTRATOR_ROLE, group);

    await banKim(true);

    try {
      await expect(
        save(adaId, group, {
          add: [{ roleId: await roleIdOf(AUDITOR_ROLE), scope: null }],
          remove: [{ assignmentId: path }],
        })
      ).rejects.toMatchObject({ code: "last-administrator" });

      expect(await namesOf(group)).toEqual([TENANT_ADMINISTRATOR_ROLE]);
    } finally {
      await banKim(false);
      await dropAdministrator(group);
    }
  });

  type Refusal = {
    readonly caller: string;
    readonly recipient: Principal;
    readonly changes: Changes;
    readonly code: string;
    readonly cleanup?: () => Promise<void>;
  };

  const REFUSALS: readonly {
    readonly label: string;
    readonly build: () => Promise<Refusal>;
  }[] = [
    {
      label: "an Ask user add",
      build: async () => ({
        caller: adaId,
        recipient: await newGroup(),
        changes: {
          add: [{ roleId: await roleIdOf(ASK_USER_ROLE), scope: null }],
        },
        code: "invalid-input",
      }),
    },
    {
      label: "Tenant administrator at a record scope",
      build: async () => ({
        caller: adaId,
        recipient: await newGroup(),
        changes: {
          add: [
            {
              roleId: await roleIdOf(TENANT_ADMINISTRATOR_ROLE),
              scope: { type: "fixture-record", id: "rec-a" },
            },
          ],
        },
        code: "invalid-input",
      }),
    },
    {
      label: "an unknown role id",
      build: async () => ({
        caller: adaId,
        recipient: await newGroup(),
        changes: {
          add: [
            { roleId: "00000000-0000-4000-8000-000000000000", scope: null },
          ],
        },
        code: "not-found",
      }),
    },
    {
      label: "another principal's assignment id",
      build: async () => {
        const recipient = await newGroup();

        await grantTo(AUDITOR_ROLE, recipient);

        return {
          caller: adaId,
          recipient,
          changes: {
            remove: [
              { assignmentId: await grantTo(AUDITOR_ROLE, await newGroup()) },
            ],
          },
          code: "not-found",
        };
      },
    },
    {
      label: "one assignment id twice",
      build: async () => {
        const recipient = await newGroup();
        const auditor = await grantTo(AUDITOR_ROLE, recipient);

        return {
          caller: adaId,
          recipient,
          changes: {
            remove: [{ assignmentId: auditor }, { assignmentId: auditor }],
          },
          code: "invalid-input",
        };
      },
    },
    {
      label: "the break-glass account as recipient",
      build: async () => ({
        caller: adaId,
        recipient: {
          type: "user",
          id: await insertUser(deployment.context, { isBreakGlass: true }),
        },
        changes: {
          add: [{ roleId: await roleIdOf(AUDITOR_ROLE), scope: null }],
        },
        code: "not-found",
      }),
    },
    {
      label: "the caller's removal of their own Tenant administrator",
      build: async () => {
        const sam: Principal = {
          type: "user",
          id: await insertUser(deployment.context, { name: "Sam" }),
        };

        return {
          caller: sam.id,
          recipient: sam,
          changes: {
            remove: [
              { assignmentId: await grantTo(TENANT_ADMINISTRATOR_ROLE, sam) },
            ],
          },
          code: "self-protection",
          cleanup: async () => {
            await dropAdministrator(sam);
          },
        };
      },
    },
  ];

  it.each(REFUSALS)(
    "A5: refuses $label and writes nothing",
    async ({ build }) => {
      const { caller, recipient, changes, code, cleanup } = await build();

      try {
        const before = await directRoles(recipient);

        await expect(save(caller, recipient, changes)).rejects.toMatchObject({
          code,
        });
        expect(await directRoles(recipient)).toEqual(before);
      } finally {
        await cleanup?.();
      }
    }
  );

  it.each([
    ["holds the key only at a scope", true],
    ["holds only a module key", false],
  ])(
    "A6: refuses the Advanced procedures to a caller who %s",
    async (_label, scoped) => {
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

      const target: Principal = { type: "user", id: reader };

      await expect(
        save(reader, target, {
          add: [{ roleId: await roleIdOf(AUDITOR_ROLE), scope: null }],
        })
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        roles(reader).administratorGuards({
          principalType: "user",
          principalId: kimId,
        })
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(roles(reader).advancedCatalogue()).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(
        roles(reader).scopeRecords({
          recordType: "fixture-record",
          query: "record",
        })
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        roles(reader).recordLabels({
          records: [{ type: "fixture-record", id: "rec-a" }],
        })
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(await directRoles(target)).toHaveLength(1);
    }
  );
});

function guards(callerId: string, recipient: Principal) {
  return roles(callerId).administratorGuards({
    principalType: recipient.type,
    principalId: recipient.id,
  });
}

describe("the Advanced access reads", () => {
  it("G1: names the last active Tenant administrator path of a person and of a group, and nothing once a second administrator exists", async () => {
    const pat: Principal = {
      type: "user",
      id: await insertUser(deployment.context),
    };

    const group = await newGroup([await insertUser(deployment.context)]);

    await banKim(true);

    try {
      const direct = await grantTo(TENANT_ADMINISTRATOR_ROLE, pat);

      expect(await guards(adaId, pat)).toEqual([
        { assignmentId: direct, reason: "last-administrator" },
      ]);

      await dropAdministrator(pat);

      const shared = await grantTo(TENANT_ADMINISTRATOR_ROLE, group);

      expect(await guards(adaId, group)).toEqual([
        { assignmentId: shared, reason: "last-administrator" },
      ]);

      await banKim(false);

      expect(await guards(adaId, group)).toEqual([]);
    } finally {
      await banKim(false);
      await dropAdministrator(pat);
      await dropAdministrator(group);
    }
  });

  it("G2: names self-protection on the caller's own direct Tenant administrator role", async () => {
    const sam: Principal = {
      type: "user",
      id: await insertUser(deployment.context, { name: "Sam" }),
    };

    try {
      const own = await grantTo(TENANT_ADMINISTRATOR_ROLE, sam);

      expect(await guards(sam.id, sam)).toEqual([
        { assignmentId: own, reason: "self-protection" },
      ]);
    } finally {
      await dropAdministrator(sam);
    }
  });

  it("G3: offers Tenant administrator, then Auditor, under Core, and never Ask user", async () => {
    const { core } = await roles(adaId).advancedCatalogue();

    expect(core.map((option) => option.roleName)).toEqual([
      TENANT_ADMINISTRATOR_ROLE,
      AUDITOR_ROLE,
    ]);

    for (const option of core) {
      expect(option).toMatchObject({
        kind: "system",
        moduleId: null,
        moduleName: "Core administration",
        enabled: true,
        wholeTenant: true,
        recordType: null,
      });
    }
  });
});

/** A person with `core:roles:manage` for the whole tenant and the given `Fixture viewer` grant. */
async function manager(
  name: string,
  fixture: "tenant" | "rec-a" | "none"
): Promise<string> {
  const id = await insertUser(deployment.context, { name });

  await grantTo("Access manager", { type: "user", id });

  if (fixture !== "none") {
    await grantTo(
      "Fixture viewer",
      { type: "user", id },
      fixture === "tenant" ? undefined : { type: "fixture-record", id: "rec-a" }
    );
  }

  return id;
}

describe("a module role at one record", () => {
  it("R1: adds a module role at one record, and scopesFor answers that record only", async () => {
    const person: Principal = {
      type: "user",
      id: await insertUser(deployment.context),
    };

    await save(adaId, person, {
      add: [
        {
          roleId: await roleIdOf("Fixture viewer"),
          scope: { type: "fixture-record", id: "rec-a" },
        },
      ],
    });

    const caller = principalFor({
      tenant: deployment.context,
      modules,
      userId: person.id,
      authenticated: true,
    });

    expect(await scopesFor(caller, "fixture:read")).toEqual({
      kind: "some",
      scopes: [{ type: "fixture-record", id: "rec-a" }],
    });
  });

  const SCOPE_REFUSALS = [
    {
      label: "a module system role for the whole tenant",
      role: "Fixture viewer",
      scope: null,
      code: "invalid-input",
    },
    {
      label: "a scope type that the role's module does not declare",
      role: "Fixture viewer",
      scope: { type: "pair-one", id: "p1" },
      code: "invalid-input",
    },
    {
      label: "a record that the resolver does not find",
      role: "Fixture viewer",
      scope: { type: "fixture-record", id: "rec-gone" },
      code: "not-found",
    },
    {
      label: "a role of a switched-off module",
      role: "Dormant user",
      scope: { type: "dormant-record", id: "d1" },
      code: "module-disabled",
    },
  ];

  it.each(SCOPE_REFUSALS)(
    "R2: refuses $label and writes nothing",
    async ({ role, scope, code }) => {
      const recipient = await newGroup();

      await expect(
        save(adaId, recipient, {
          add: [{ roleId: await roleIdOf(role), scope }],
        })
      ).rejects.toMatchObject({ code });
      expect(await directRoles(recipient)).toEqual([]);
    }
  );

  it("R3: offers a record scope only for a module with one searchable record type", async () => {
    const { record } = await roles(adaId).advancedCatalogue();

    expect(
      record.map((option) => [
        option.moduleId,
        option.roleName,
        option.enabled,
        option.wholeTenant,
        option.recordType,
      ])
    ).toEqual([
      ["dormant", "Dormant user", false, false, "dormant-record"],
      ["fixture", "Fixture viewer", true, false, "fixture-record"],
      ["fixture", "Fixture editor", true, false, "fixture-record"],
    ]);
  });
});

describe("custom roles", () => {
  beforeAll(async () => {
    for (const [name, moduleId, key] of [
      ["Access auditor", null, "core:audit:read"],
      ["Fixture approver", "fixture", "fixture:use"],
      ["Pair approver", "pair", "pair:use"],
      ["Dormant approver", "dormant", "dormant:use"],
      ["Ghost approver", "ghost", "ghost:use"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- five rows, in order.
      await insertRole(deployment.context, {
        name,
        moduleId,
        permissions: [key],
      });
    }
  });

  it("C1: adds custom roles for the whole tenant and a module custom role at one record", async () => {
    const group = await newGroup();
    const approver = await roleIdOf("Fixture approver");

    await save(adaId, group, {
      add: [
        { roleId: await roleIdOf("Access auditor"), scope: null },
        { roleId: approver, scope: null },
        { roleId: approver, scope: { type: "fixture-record", id: "rec-b" } },
      ],
    });

    const rows = await deployment.context.db.$client.query<{
      readonly name: string;
      readonly scopeType: string | null;
      readonly scopeId: string | null;
    }>(
      `select r.name, a.scope_type as "scopeType", a.scope_id as "scopeId"
         from role_assignment a join role r on r.id = a.role_id
        where a.principal_type = 'group' and a.principal_id = $1
        order by r.name, a.scope_id nulls first`,
      [group.id]
    );

    expect(rows.rows).toEqual([
      { name: "Access auditor", scopeType: null, scopeId: null },
      { name: "Fixture approver", scopeType: null, scopeId: null },
      {
        name: "Fixture approver",
        scopeType: "fixture-record",
        scopeId: "rec-b",
      },
    ]);
  });

  it("C3: lists the custom roles with their module, state and record type", async () => {
    const { custom } = await roles(adaId).advancedCatalogue();

    // Other tests insert custom core roles named "Role <uuid>".
    const named = custom.filter(
      (option) => !option.roleName.startsWith("Role ")
    );

    expect(
      named.map((option) => [
        option.roleName,
        option.moduleName,
        option.enabled,
        option.recordType,
      ])
    ).toEqual([
      ["Access auditor", "Core administration", true, null],
      ["Access manager", "Core administration", true, null],
      ["Dormant approver", "Dormant", false, "dormant-record"],
      ["Fixture approver", "Fixture", true, "fixture-record"],
      ["Pair approver", "Pair", true, null],
    ]);
    expect(custom.map((option) => option.roleName)).not.toContain(
      "Ghost approver"
    );
    expect(custom.every((option) => option.wholeTenant)).toBe(true);
  });
});

function search(callerId: string, recordType: string, query: string) {
  return roles(callerId).scopeRecords({ recordType, query });
}

describe("the scope picker records", () => {
  let reader: string;
  let scout: string;
  let bare: string;

  beforeAll(async () => {
    reader = await manager("Reader", "tenant");
    scout = await manager("Scout", "rec-a");
    bare = await manager("Bare", "none");
  });

  it("S2: lists the matching records that the caller can open, with the resolver's label", async () => {
    expect(await search(reader, "fixture-record", "record")).toEqual([
      { id: "rec-a", label: "Record A" },
      { id: "rec-b", label: "Record B" },
    ]);
    expect(await search(scout, "fixture-record", "record")).toEqual([
      { id: "rec-a", label: "Record A" },
    ]);
    expect(await search(bare, "fixture-record", "record")).toEqual([]);
  });

  it.each([
    ["no-such-type", "not-found"],
    ["plain-note", "not-found"],
    ["dormant-record", "module-disabled"],
  ])("S3: refuses a search of %s with %s", async (recordType, code) => {
    await expect(search(reader, recordType, "")).rejects.toMatchObject({
      code,
    });
  });

  it("S4: labels only the records that the caller can open", async () => {
    expect(
      await roles(scout).recordLabels({
        records: [
          { type: "fixture-record", id: "rec-a" },
          { type: "fixture-record", id: "rec-b" },
          { type: "fixture-record", id: "rec-gone" },
        ],
      })
    ).toEqual([{ type: "fixture-record", id: "rec-a", label: "Record A" }]);
  });
});
