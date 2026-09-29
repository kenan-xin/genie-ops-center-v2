import { eq, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  withTransaction,
  type TenantTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { role, roleAssignment } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";
import { CORE_PERMISSION_KEYS } from "../authorization/roles.ts";

/** The role catalogue entries a screen may offer, and what it can say about each module. */
export type RolesModule = Pick<Module, "identity" | "permissions">;

/** Why a stored key no longer grants: its module is switched off, or the key is retired/unknown. */
export type UnavailableReason = "module-disabled" | "retired";

/** One stored key outside the selectable catalogue, with why it is unavailable. */
export type UnavailableKey = {
  readonly key: string;
  readonly reason: UnavailableReason;
};

/** One permission key as the role editor groups it. */
export type RolePermissionKey = {
  readonly key: string;
  readonly label: string;
  /** R-33b: a stored key the catalogue no longer offers. It never grants; a custom role may remove it. */
  readonly unavailable: boolean;
  /** Present exactly when `unavailable` is true. */
  readonly unavailableReason?: UnavailableReason | undefined;
};

export type RolePermissionGroup = {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly entitled: boolean;
  readonly keys: readonly RolePermissionKey[];
};

export type RoleRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "system" | "custom";
  readonly moduleId: string | null;
  readonly permissions: readonly string[];
  readonly assignmentCount: number;
  /** R-31: keys appended automatically when a module was entitled (Tenant administrator only). */
  readonly entitlementAdded: readonly string[];
  /** R-33b: stored keys the entitled catalogue does not offer, each with why. */
  readonly unavailableKeys: readonly UnavailableKey[];
};

export type RoleAssignmentRow = {
  readonly id: string;
  readonly principalType: "user" | "group";
  readonly principalId: string;
  readonly principalLabel: string;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
};

export type RoleDetail = RoleRow & {
  readonly permissionGroups: readonly RolePermissionGroup[];
  readonly assignments: readonly RoleAssignmentRow[];
};

type RawRole = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
  readonly permissions: readonly string[];
  readonly assignmentCount: number;
};

/** The `<id>:admin` keys core appends to `Tenant administrator` when a module is entitled (R-31). */
function moduleAdminKeys(modules: readonly RolesModule[]): ReadonlySet<string> {
  return new Set(
    modules.flatMap((module) => {
      const key = `${module.identity.id}:admin`;

      return module.permissions.some((entry) => entry.key === key) ? [key] : [];
    })
  );
}

/** Each included module's entitlement state, read once (DEC-46 caches the reads). */
async function entitlementByModule(
  tenant: TenantContext,
  modules: readonly RolesModule[]
): Promise<ReadonlyMap<string, boolean>> {
  const enabled = await Promise.all(
    modules.map((module) => tenant.entitlements.isEnabled(module.identity.id))
  );

  return new Map(
    modules.map((module, index) => [
      module.identity.id,
      enabled[index] === true,
    ])
  );
}

/** Core keys plus the declared keys of every entitled module: what a role may newly grant. */
function availableKeySet(
  modules: readonly RolesModule[],
  entitled: ReadonlyMap<string, boolean>
): ReadonlySet<string> {
  const keys = new Set<string>(CORE_PERMISSION_KEYS);

  for (const module of modules) {
    if (entitled.get(module.identity.id) !== true) continue;

    for (const entry of module.permissions) keys.add(entry.key);
  }

  return keys;
}

/** Why a stored key is outside the available set: its module is compiled but off, or it is unknown. */
function unavailableReasonFor(
  key: string,
  modules: readonly RolesModule[],
  entitled: ReadonlyMap<string, boolean>
): UnavailableReason {
  const moduleId = key.split(":")[0] ?? "core";
  const compiled = modules.some((module) => module.identity.id === moduleId);

  return compiled && entitled.get(moduleId) !== true
    ? "module-disabled"
    : "retired";
}

/** The stored keys outside the available set, each with its reason (R-33b). */
function unavailableKeysOf(
  permissions: readonly string[],
  modules: readonly RolesModule[],
  entitled: ReadonlyMap<string, boolean>
): readonly UnavailableKey[] {
  const available = availableKeySet(modules, entitled);

  return permissions.flatMap((key) =>
    available.has(key)
      ? []
      : [{ key, reason: unavailableReasonFor(key, modules, entitled) }]
  );
}

function toRoleRow(
  raw: RawRole,
  adminKeys: ReadonlySet<string>,
  unavailableKeys: readonly UnavailableKey[]
): RoleRow {
  const permissions = [...raw.permissions];

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    kind: raw.isSystem ? "system" : "custom",
    moduleId: raw.moduleId,
    permissions,
    assignmentCount: Number(raw.assignmentCount),
    entitlementAdded:
      raw.name === TENANT_ADMINISTRATOR_ROLE
        ? permissions.filter((key) => adminKeys.has(key))
        : [],
    unavailableKeys,
  };
}

const ROLE_COLUMNS = `
  r.id::text as "id",
  r.name,
  coalesce(r.description, '') as description,
  r.is_system as "isSystem",
  r.module_id as "moduleId",
  r.permissions,
  (select count(*) from role_assignment a where a.role_id = r.id)::int as "assignmentCount"`;

/** Every role, system first then by name (the Roles directory). */
export async function listRoles(
  tenant: TenantContext,
  modules: readonly RolesModule[]
): Promise<readonly RoleRow[]> {
  const adminKeys = moduleAdminKeys(modules);
  const entitled = await entitlementByModule(tenant, modules);

  const result = await tenant.db.$client.query(
    `select ${ROLE_COLUMNS} from role r order by r.is_system desc, lower(r.name)`
  );

  // SAFETY: the statement selects exactly the role columns.
  return (result.rows as readonly RawRole[]).map((row) =>
    toRoleRow(
      row,
      adminKeys,
      unavailableKeysOf(row.permissions, modules, entitled)
    )
  );
}

function permissionGroups(
  permissions: readonly string[],
  modules: readonly RolesModule[],
  available: ReadonlySet<string>,
  entitled: ReadonlyMap<string, boolean>
): readonly RolePermissionGroup[] {
  const labels = new Map<string, string>();

  for (const module of modules) {
    for (const entry of module.permissions) labels.set(entry.key, entry.label);
  }

  const groups = new Map<string, RolePermissionKey[]>();

  for (const key of permissions) {
    const moduleId = key.split(":")[0] ?? "core";
    const list = groups.get(moduleId) ?? [];
    const unavailable = !available.has(key);

    list.push({
      key,
      label: labels.get(key) ?? key,
      unavailable,
      unavailableReason: unavailable
        ? unavailableReasonFor(key, modules, entitled)
        : undefined,
    });
    groups.set(moduleId, list);
  }

  const names = new Map<string, string>([
    ["core", "Core"],
    ...modules.map(
      (module) => [module.identity.id, module.identity.displayName] as const
    ),
  ]);

  return [...groups.entries()].map(([moduleId, keys]) => ({
    moduleId,
    moduleName: names.get(moduleId) ?? moduleId,
    entitled: entitled.get(moduleId) ?? false,
    keys,
  }));
}

/** One role with its permission groups and the principals that hold it, for the detail page. */
export async function readRole(
  tenant: TenantContext,
  roleId: string,
  modules: readonly RolesModule[]
): Promise<RoleDetail | undefined> {
  const adminKeys = moduleAdminKeys(modules);
  const entitled = await entitlementByModule(tenant, modules);
  const available = availableKeySet(modules, entitled);

  const found = await tenant.db.$client.query(
    `select ${ROLE_COLUMNS} from role r where r.id = $1::uuid`,
    [roleId]
  );

  // SAFETY: the statement selects exactly the role columns.
  const [raw] = found.rows as readonly RawRole[];

  if (raw === undefined) return undefined;

  const assignments = await tenant.db.$client.query(
    `select a.id::text as id, a.principal_type as "principalType",
            a.principal_id as "principalId",
            coalesce(u.name, g.name, 'Unknown') as "principalLabel",
            a.scope_type as "scopeType", a.scope_id as "scopeId"
       from role_assignment a
       left join "user" u on a.principal_type = 'user' and u.id = a.principal_id
       left join "group" g on a.principal_type = 'group' and g.id = a.principal_id::uuid
      where a.role_id = $1::uuid
      order by a.principal_type, lower(coalesce(u.name, g.name))`,
    [roleId]
  );

  return {
    ...toRoleRow(
      raw,
      adminKeys,
      unavailableKeysOf(raw.permissions, modules, entitled)
    ),
    permissionGroups: permissionGroups(
      raw.permissions,
      modules,
      available,
      entitled
    ),
    // SAFETY: the statement selects exactly the assignment columns.
    assignments: assignments.rows as readonly RoleAssignmentRow[],
  };
}

/**
 * The keys a role may newly grant: core's own keys plus the declared keys of every included module
 * whose entitlement is enabled. A disabled module's keys are excluded, so a role can never acquire
 * a dormant key that starts granting when the module is later switched on (R-33a, R-33b).
 */
async function entitledCatalogue(
  tenant: TenantContext,
  modules: readonly RolesModule[]
): Promise<ReadonlySet<string>> {
  return availableKeySet(modules, await entitlementByModule(tenant, modules));
}

function assertPermissionsDeclared(
  permissions: readonly string[],
  catalogue: ReadonlySet<string>,
  existing: ReadonlySet<string>
): void {
  // Only a *newly introduced* undeclared key is refused. A key already stored on the role is a
  // retired or absent-module key (R-33b): it grants nothing, and an edit that keeps or removes it
  // must not fail on it, so a custom role can drop one unavailable key while keeping another.
  const unknown = permissions.filter(
    (key) => !catalogue.has(key) && !existing.has(key)
  );

  if (unknown.length > 0) {
    throw new AppError(CORE_ERRORS["invalid-input"], {
      cause: new Error(`Undeclared permission keys: ${unknown.join(", ")}`),
    });
  }
}

/**
 * The declared permission catalogue the role form offers, grouped by module with each module's
 * entitlement state (R-33): core's own keys and every included module's declared keys. This is
 * what a new or edited role picks from, never the selected role's stored keys.
 */
export async function declaredCatalogue(
  tenant: TenantContext,
  modules: readonly RolesModule[]
): Promise<readonly RolePermissionGroup[]> {
  const groups = new Map<string, RolePermissionKey[]>();

  const push = (moduleId: string, key: string, label: string) => {
    const list = groups.get(moduleId) ?? [];

    list.push({ key, label, unavailable: false });
    groups.set(moduleId, list);
  };

  for (const key of CORE_PERMISSION_KEYS) push("core", key, key);

  // Only an included, entitled module's keys are selectable: a disabled module's keys are not
  // offered, so a role cannot be given a key that does not grant today (R-33a).
  const enabled = await Promise.all(
    modules.map((module) => tenant.entitlements.isEnabled(module.identity.id))
  );

  for (const [index, module] of modules.entries()) {
    if (enabled[index] !== true) continue;

    for (const entry of module.permissions) {
      push(module.identity.id, entry.key, entry.label);
    }
  }

  const names = new Map<string, string>([
    ["core", "Core"],
    ...modules.map(
      (module) => [module.identity.id, module.identity.displayName] as const
    ),
  ]);

  return [...groups.entries()].map(([moduleId, keys]) => ({
    moduleId,
    moduleName: names.get(moduleId) ?? moduleId,
    entitled: true,
    keys,
  }));
}

async function assertNameFree(
  tx: TenantTransaction,
  name: string,
  exceptRoleId?: string
): Promise<void> {
  const rows = await tx
    .select({ id: role.id })
    .from(role)
    .where(eq(role.name, name))
    .limit(1);

  const existing = rows[0];

  if (existing !== undefined && existing.id !== exceptRoleId) {
    throw new AppError(CORE_ERRORS["role-name-taken"]);
  }
}

/** R-33: create a custom role from a picked set of declared permission keys. */
export async function createRole(
  tenant: TenantContext,
  modules: readonly RolesModule[],
  input: {
    readonly actorUserId: string;
    readonly name: string;
    readonly description?: string | undefined;
    readonly permissions: readonly string[];
    readonly copiedFrom?: string;
  }
): Promise<string> {
  const name = input.name.trim();

  if (name === "") throw new AppError(CORE_ERRORS["invalid-input"]);

  // A new role, a copy included, may carry only keys the entitled catalogue offers. A copy of a
  // role holding a disabled module's key is refused rather than silently created with dormant
  // grants (R-33a).
  assertPermissionsDeclared(
    input.permissions,
    await entitledCatalogue(tenant, modules),
    new Set()
  );

  return withTransaction(tenant, async (tx) => {
    await assertNameFree(tx, name);

    const [row] = await tx
      .insert(role)
      .values({
        name,
        description: input.description?.trim() || null,
        permissions: [...input.permissions],
        isSystem: false,
      })
      .returning({ id: role.id });

    if (row === undefined) throw new Error("the role insert returned no row");

    await writeAdminAuditEvent(tx, {
      action: "core:role_created",
      actorUserId: input.actorUserId,
      targetType: "role",
      targetId: row.id,
      summary: `Created the role ${name}`,
      metadata: {
        name,
        permissions: [...input.permissions],
        copiedFrom: input.copiedFrom ?? null,
      },
    });

    return row.id;
  });
}

/** R-33: edit a custom role. A system role is read-only and refused with `system-role`. */
export async function updateRole(
  tenant: TenantContext,
  modules: readonly RolesModule[],
  input: {
    readonly actorUserId: string;
    readonly roleId: string;
    readonly name: string;
    readonly description?: string | undefined;
    readonly permissions: readonly string[];
  }
): Promise<void> {
  const name = input.name.trim();

  if (name === "") throw new AppError(CORE_ERRORS["invalid-input"]);

  const catalogue = await entitledCatalogue(tenant, modules);

  await withTransaction(tenant, async (tx) => {
    const rows = await tx
      .select({
        id: role.id,
        isSystem: role.isSystem,
        permissions: role.permissions,
      })
      .from(role)
      .where(eq(role.id, input.roleId))
      .limit(1);

    const existing = rows[0];

    if (existing === undefined) {
      throw new AppError(CORE_ERRORS["not-found"]);
    }

    if (existing.isSystem) {
      throw new AppError(CORE_ERRORS["system-role"]);
    }

    assertPermissionsDeclared(
      input.permissions,
      catalogue,
      new Set(existing.permissions)
    );

    await assertNameFree(tx, name, input.roleId);

    await tx
      .update(role)
      .set({
        name,
        description: input.description?.trim() || null,
        permissions: [...input.permissions],
        updatedAt: sql`now()`,
      })
      .where(eq(role.id, input.roleId));

    await writeAdminAuditEvent(tx, {
      action: "core:role_updated",
      actorUserId: input.actorUserId,
      targetType: "role",
      targetId: input.roleId,
      summary: `Updated the role ${name}`,
      metadata: { name, permissions: [...input.permissions] },
    });
  });
}

/** R-33: delete a custom role with its assignments. A system role is never deleted. */
export async function deleteRole(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly roleId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    const rows = await tx
      .select({ id: role.id, name: role.name, isSystem: role.isSystem })
      .from(role)
      .where(eq(role.id, input.roleId))
      .limit(1);

    const existing = rows[0];

    if (existing === undefined) {
      throw new AppError(CORE_ERRORS["not-found"]);
    }

    if (existing.isSystem) {
      throw new AppError(CORE_ERRORS["system-role"]);
    }

    await tx
      .delete(roleAssignment)
      .where(eq(roleAssignment.roleId, input.roleId));
    await tx.delete(role).where(eq(role.id, input.roleId));

    await writeAdminAuditEvent(tx, {
      action: "core:role_deleted",
      actorUserId: input.actorUserId,
      targetType: "role",
      targetId: input.roleId,
      summary: `Deleted the role ${existing.name}`,
      metadata: { name: existing.name },
    });
  });
}

/**
 * Copy a role into a custom one. A system role can be copied but never edited, so this is how an
 * administrator changes one: the copy starts from the same keys and is theirs to edit.
 */
export async function copyRole(
  tenant: TenantContext,
  modules: readonly RolesModule[],
  input: {
    readonly actorUserId: string;
    readonly roleId: string;
    readonly name: string;
  }
): Promise<string> {
  const rows = await tenant.db
    .select({
      description: role.description,
      permissions: role.permissions,
    })
    .from(role)
    .where(eq(role.id, input.roleId))
    .limit(1);

  const source = rows[0];

  if (source === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  return createRole(tenant, modules, {
    actorUserId: input.actorUserId,
    name: input.name,
    description: source.description ?? undefined,
    permissions: source.permissions,
    copiedFrom: input.roleId,
  });
}
