import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type { PermissionKey } from "../src/lib/module-contract/keys.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type {
  Module,
  PermissionTransformation,
} from "../src/lib/module-contract/module.ts";
import {
  PERMISSION_TRANSFORMATION_ACTION,
  TENANT_ADMINISTRATOR_ROLE,
  can,
  principalFor,
  scopesFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import {
  migrationPlan,
  moduleHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";
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
 * The upgrade verification matrix of `docs/architecture/permission-evolution.md` (Spec 2 AC-25,
 * R-33a to R-33c), run in order against one existing database through real migrator runs. Each
 * case is one release of the `evo` module; every assertion reads real rows through the real
 * evaluator, and the identities of roles, assignments and memberships are compared before and
 * after each release.
 */
const FOLDER = { type: "fixture_folder", id: "folder-1" };

/** A key no module in this image declares. */
const GHOST_KEY: PermissionKey = "ghost:haunt";

const RECORD = { type: "fixture_record", id: "record-1" };

function key(action: string): `evo:${string}` {
  return `evo:${action}`;
}

const T = {
  renameUserRole: {
    id: "0001-rename-user-role",
    release: "2.1.0",
    description: "Rename Evo user to Evo member",
    change: { kind: "rename-role", from: "Evo user", to: "Evo member" },
  },
  readToView: {
    id: "0002-read-to-view",
    release: "2.2.0",
    description: "Rename evo:read to evo:view",
    change: { kind: "rename", from: "evo:read", to: "evo:view" },
  },
  revokeAdmin: {
    id: "0003-revoke-admin",
    release: "2.3.0",
    description: "Revoke evo:admin, which granted an unsafe purge",
    change: { kind: "revoke", key: "evo:admin" },
  },
  useToWork: {
    id: "0005-use-to-work",
    release: "2.5.0",
    description: "Rename evo:use to evo:work",
    change: { kind: "rename", from: "evo:use", to: "evo:work" },
  },
  revokeApprove: {
    id: "0006-revoke-approve",
    release: "2.5.0",
    description: "Revoke evo:approve",
    change: { kind: "revoke", key: "evo:approve" },
  },
} satisfies Record<string, PermissionTransformation>;

/** One release of the `evo` module: its keys, default roles and transformations so far. */
function evo(release: {
  readonly actions: readonly string[];
  readonly defaultRoles: Module["defaultRoles"];
  readonly transformations?: readonly PermissionTransformation[];
}): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id: "evo", displayName: "Evo" },
    schema: {
      ...validModule.schema,
      migrationsTable: moduleLedgerTable("evo"),
    },
    permissions: release.actions.map((action) => ({
      key: key(action),
      label: action,
    })),
    recordTypes: [
      {
        type: RECORD.type,
        parentTypes: [FOLDER.type],
        resolve: async (_ctx, id) => ({ label: id, parents: [FOLDER] }),
      },
    ],
    defaultRoles: release.defaultRoles,
    permissionTransformations: release.transformations ?? [],
  };
}

function other(
  transformations: readonly PermissionTransformation[] = []
): Module {
  const renamed = transformations.length > 0;

  return {
    ...validModule,
    identity: { ...validModule.identity, id: "other", displayName: "Other" },
    schema: {
      ...validModule.schema,
      migrationsTable: moduleLedgerTable("other"),
    },
    permissions: [
      { key: renamed ? "other:work" : "other:use", label: "Use other" },
    ],
    recordTypes: [],
    defaultRoles: [],
    permissionTransformations: transformations,
  };
}

const v1 = evo({
  actions: ["read", "use", "admin"],
  defaultRoles: [{ name: "Evo user", permissions: ["evo:use"] }],
});

const v2Roles = [
  { name: "Evo user", permissions: ["evo:use"] },
  { name: "Evo approver", permissions: ["evo:approve"] },
] as const;

const v2 = evo({
  actions: ["read", "use", "admin", "approve"],
  defaultRoles: v2Roles,
});

const v3Roles = [
  { name: "Evo member", permissions: ["evo:use"] },
  { name: "Evo approver", permissions: ["evo:approve"] },
] as const;

const v3 = evo({
  actions: ["read", "use", "admin", "approve"],
  defaultRoles: v3Roles,
  transformations: [T.renameUserRole],
});

const v4 = evo({
  actions: ["view", "use", "admin", "approve"],
  defaultRoles: v3Roles,
  transformations: [T.renameUserRole, T.readToView],
});

const v5 = evo({
  actions: ["view", "use", "admin", "approve"],
  defaultRoles: [
    { name: "Evo member", permissions: ["evo:use", "evo:approve"] },
    { name: "Evo approver", permissions: ["evo:approve"] },
  ],
  transformations: [T.renameUserRole, T.readToView],
});

const v6 = evo({
  actions: ["view", "use", "admin", "approve"],
  defaultRoles: v3Roles,
  transformations: [T.renameUserRole, T.readToView, T.revokeAdmin],
});

const v8 = evo({
  actions: ["view", "work", "admin"],
  defaultRoles: [{ name: "Evo member", permissions: ["evo:work"] }],
  transformations: [
    T.renameUserRole,
    T.readToView,
    T.revokeAdmin,
    T.useToWork,
    T.revokeApprove,
  ],
});

const useToOther: PermissionTransformation = {
  id: "0004-use-to-work",
  release: "1.1.0",
  description: "Rename other:use to other:work",
  change: { kind: "rename", from: "other:use", to: "other:work" },
};

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let current: readonly Module[] = [v1, other()];

const people: Record<string, string> = {};

const roles: Record<string, string> = {};

async function upgrade(modules: readonly Module[]): Promise<void> {
  await runMigrations({
    env: deployment.context.env,
    pool: deployment.context.db.$client,
    histories: migrationPlan(modules.map(moduleHistory)),
    compiledModuleIds: modules.map((module) => module.identity.id),
  });

  current = modules;
}

function request(person: string) {
  return principalFor({
    tenant: deployment.context,
    modules: current,
    userId: people[person],
    authenticated: true,
  });
}

async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await deployment.context.db.$client.query(text, values);

  // SAFETY: each caller names the columns its own statement selects as `T`.
  return result.rows as T[];
}

/** Every identity an upgrade must preserve: roles, assignments with scopes, memberships. */
async function identities() {
  return {
    roles: await query("select id from role order by id"),
    assignments: await query(
      "select id, role_id, principal_type, principal_id, scope_type, scope_id from role_assignment order by id"
    ),
    members: await query(
      "select group_id, user_id from group_member order by group_id, user_id"
    ),
  };
}

async function permissionsOf(name: string): Promise<string[] | undefined> {
  const rows = await query<{ permissions: string[] }>(
    "select permissions from role where name = $1",
    [name]
  );

  return rows[0]?.permissions;
}

async function auditRows(transformation: string) {
  return query<{
    actor_user_id: string | null;
    metadata: {
      readonly release: string;
      readonly change: PermissionTransformation["change"];
      readonly roles: readonly {
        readonly id: string;
        readonly before: readonly string[];
        readonly after: readonly string[];
      }[];
    };
  }>(
    "select actor_user_id, metadata from audit_event where action = $1 and metadata->>'transformation' = $2",
    [PERMISSION_TRANSFORMATION_ACTION, transformation]
  );
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(current);
  const { context } = deployment;

  await enableModules(context, ["evo", "other"]);
  await seedRoles(context, current);

  const [evoUser] = await query<{ id: string }>(
    "select id from role where name = 'Evo user'"
  );

  roles.evoUser = evoUser?.id ?? "";
  roles.copy = await insertRole(context, {
    name: "Evo copy",
    permissions: ["evo:use", "evo:read"],
  });
  roles.mixed = await insertRole(context, {
    name: "Mixed",
    permissions: ["evo:read", "other:use"],
  });
  roles.purger = await insertRole(context, {
    name: "Evo purger",
    permissions: ["evo:admin", "evo:use"],
  });

  for (const person of [
    "direct",
    "grouped",
    "archived",
    "copy",
    "mixed",
    "purger",
  ]) {
    // Each person is a separate row; the order only keeps the ids readable in a failure.
    // oxlint-disable-next-line no-await-in-loop
    people[person] = await insertUser(context);
  }

  const live = await insertGroup(context, [people.grouped ?? ""]);

  const archived = await insertGroup(context, [people.archived ?? ""], {
    archivedAt: new Date(),
  });

  await assignRole(context, {
    roleId: roles.evoUser,
    principal: { type: "user", id: people.direct ?? "" },
  });
  await assignRole(context, {
    roleId: roles.evoUser,
    principal: { type: "group", id: live },
    scope: FOLDER,
  });
  await assignRole(context, {
    roleId: roles.evoUser,
    principal: { type: "group", id: archived },
  });
  await assignRole(context, {
    roleId: roles.copy,
    principal: { type: "user", id: people.copy ?? "" },
    scope: RECORD,
  });
  await assignRole(context, {
    roleId: roles.mixed,
    principal: { type: "user", id: people.mixed ?? "" },
  });
  await assignRole(context, {
    roleId: roles.purger,
    principal: { type: "user", id: people.purger ?? "" },
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

describe("permission evolution against an existing database", () => {
  it("adds a permission and a new system role without granting either to anyone", async () => {
    const before = await identities();

    await upgrade([v2, other()]);
    await seedRoles(deployment.context, current);

    expect(await permissionsOf("Evo approver")).toEqual(["evo:approve"]);
    expect(await permissionsOf("Evo user")).toEqual(["evo:use"]);
    expect(await permissionsOf("Evo copy")).toEqual(["evo:use", "evo:read"]);
    expect(await can(request("direct"), "evo:approve")).toBe(false);
    expect(await can(request("direct"), "evo:use")).toBe(true);
    expect((await identities()).assignments).toEqual(before.assignments);
    expect((await identities()).members).toEqual(before.members);
  });

  it("renames a system role's display name, keeping its id and assignments", async () => {
    const before = await identities();

    await upgrade([v3, other()]);
    await seedRoles(deployment.context, current);

    const renamed = await query<{ id: string }>(
      "select id from role where name in ('Evo user', 'Evo member')"
    );

    expect(renamed).toEqual([{ id: roles.evoUser }]);
    expect(await identities()).toEqual(before);
    expect(await can(request("direct"), "evo:use")).toBe(true);
  });

  it("applies an equivalent permission rename to system and custom roles with the same scopes", async () => {
    const before = await identities();

    await upgrade([v4, other()]);

    expect(await permissionsOf("Evo copy")).toEqual(["evo:use", "evo:view"]);
    expect(await permissionsOf("Mixed")).toEqual(["evo:view", "other:use"]);
    expect(await identities()).toEqual(before);

    expect(await can(request("copy"), "evo:view", RECORD)).toBe(true);
    expect(
      await can(request("copy"), "evo:view", {
        type: RECORD.type,
        id: "record-2",
      })
    ).toBe(false);
    expect(await scopesFor(request("mixed"), "evo:view")).toEqual({
      kind: "all",
    });
    expect(await scopesFor(request("grouped"), "evo:use")).toEqual({
      kind: "some",
      scopes: [FOLDER],
    });
    expect(await can(request("grouped"), "evo:use", RECORD)).toBe(true);
    expect(await can(request("archived"), "evo:use")).toBe(false);
  });

  it("does not broaden an assigned default role when a release declares it wider", async () => {
    await upgrade([v5, other()]);
    await seedRoles(deployment.context, current);

    expect(await permissionsOf("Evo member")).toEqual(["evo:use"]);
    expect(await can(request("direct"), "evo:approve")).toBe(false);
  });

  it("refuses a retired or unknown key while the same role's valid keys keep working", async () => {
    await query(
      "update role set permissions = permissions || array['evo:read', 'ghost:haunt'] where id = $1",
      [roles.mixed]
    );

    const mixed = request("mixed");

    expect(await can(mixed, "evo:read")).toBe(false);
    expect(await can(mixed, GHOST_KEY)).toBe(false);
    expect(await scopesFor(mixed, "evo:read")).toEqual({ kind: "none" });
    expect(await can(mixed, "evo:view")).toBe(true);
    expect(await can(mixed, "other:use")).toBe(true);
    expect(await permissionsOf("Mixed")).toEqual([
      "evo:view",
      "other:use",
      "evo:read",
      "ghost:haunt",
    ]);
  });

  it("revokes unsafe authority with an audited transformation and keeps other authority", async () => {
    const before = await identities();

    await upgrade([v6, other()]);

    expect(await can(request("purger"), "evo:admin")).toBe(false);
    expect(await can(request("purger"), "evo:use")).toBe(true);
    expect(await permissionsOf("Evo purger")).toEqual(["evo:use"]);
    expect(await identities()).toEqual(before);

    const [audit] = await auditRows("evo/0003-revoke-admin");

    expect(audit?.actor_user_id).toBeNull();
    expect(audit?.metadata).toMatchObject({
      release: "2.3.0",
      change: { kind: "revoke", key: "evo:admin" },
      roles: expect.arrayContaining([
        {
          id: roles.purger,
          before: ["evo:admin", "evo:use"],
          after: ["evo:use"],
        },
      ]),
    });
  });

  it("applies a transformation once under concurrent starts and retries", async () => {
    const next = [v6, other([useToOther])];

    await Promise.all([upgrade(next), upgrade(next)]);
    await upgrade(next);

    expect(await auditRows("other/0004-use-to-work")).toHaveLength(1);
    expect(await permissionsOf("Mixed")).toEqual([
      "evo:view",
      "other:work",
      "evo:read",
      "ghost:haunt",
    ]);
    expect(await can(request("mixed"), "other:work")).toBe(true);
    expect(
      await query("select 1 from role where name = 'Evo member'")
    ).toHaveLength(1);
  });

  it("exposes no partial transformation after a failure, fails the start, and a repaired retry completes", async () => {
    const next = [v8, other([useToOther])];
    const before = await permissionsOf("Evo member");

    await query(`
      create function refuse_evo_0006() returns trigger language plpgsql as $$
      begin
        if new.metadata->>'transformation' = 'evo/0006-revoke-approve' then
          raise exception 'injected failure';
        end if;
        return new;
      end $$`);
    await query(
      "create trigger refuse_evo_0006 before insert on audit_event for each row execute function refuse_evo_0006()"
    );

    await expect(upgrade(next)).rejects.toThrow();

    // 0005 ran before the failure in the same transaction, so it rolled back with it.
    expect(await permissionsOf("Evo member")).toEqual(before);
    expect(await auditRows("evo/0005-use-to-work")).toHaveLength(0);

    await query("drop trigger refuse_evo_0006 on audit_event");
    await upgrade(next);

    expect(await permissionsOf("Evo member")).toEqual(["evo:work"]);
    expect(await permissionsOf("Evo approver")).toEqual([]);
    expect(await auditRows("evo/0005-use-to-work")).toHaveLength(1);
    expect(await auditRows("evo/0006-revoke-approve")).toHaveLength(1);
    expect(await can(request("direct"), "evo:work")).toBe(true);
  });

  it("changes only the declared admin key on Tenant administrator when the module is re-enabled", async () => {
    const before = await permissionsOf(TENANT_ADMINISTRATOR_ROLE);

    await setModuleEnabled(deployment.context, current, "evo", false);
    await setModuleEnabled(deployment.context, current, "evo", true);

    const after = await permissionsOf(TENANT_ADMINISTRATOR_ROLE);

    expect(after?.filter((entry) => !before?.includes(entry))).toEqual([
      "evo:admin",
    ]);
    expect(after).not.toContain("evo:work");
  });

  it("covers a new record with a broad grant and not with a narrow one", async () => {
    const newRecord = { type: RECORD.type, id: "record-new" };

    expect(await can(request("direct"), "evo:work", newRecord)).toBe(true);
    expect(await can(request("copy"), "evo:view", newRecord)).toBe(false);
    expect(await can(request("direct"), "other:work", newRecord)).toBe(false);
  });
});
