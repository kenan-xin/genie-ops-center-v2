import { and, eq, sql } from "drizzle-orm";

import type { Module } from "../../lib/module-contract/module.ts";
import {
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { group, role, roleAssignment } from "../../schema.ts";

/** Core's own permission keys, declared exactly as a module declares its own (R-33). */
export const CORE_PERMISSION_KEYS = [
  "core:people:manage",
  "core:groups:manage",
  "core:roles:manage",
  "core:branding:manage",
  "core:settings:manage",
  "core:audit:read",
] as const;

export {
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../../lib/module-contract/system-roles.ts";

const CORE_ROLES = [
  {
    name: TENANT_ADMINISTRATOR_ROLE,
    permissions: [...CORE_PERMISSION_KEYS],
    moduleId: null,
    isSystem: true,
  },
  {
    name: AUDITOR_ROLE,
    permissions: ["core:audit:read"],
    moduleId: null,
    isSystem: true,
  },
];

/**
 * Every key that can grant in this image: core's own and each compiled module's declared keys.
 * A stored key outside this set is retired or belongs to an absent module, and never grants
 * (R-33b, R-33d).
 */
export function permissionCatalogue(
  modules: readonly Pick<Module, "permissions">[]
): ReadonlySet<string> {
  return new Set<string>([
    ...CORE_PERMISSION_KEYS,
    ...modules.flatMap((module) =>
      module.permissions.map((entry) => entry.key)
    ),
  ]);
}

/** The `<id>:admin` key a module declares, or undefined when it has no admin pages (R-31). */
function adminKeyOf(
  module: Pick<Module, "identity" | "permissions">
): string | undefined {
  const key = `${module.identity.id}:admin`;

  return module.permissions.some((entry) => entry.key === key)
    ? key
    : undefined;
}

/**
 * R-31, DEC-23: appends a module's admin key to `Tenant administrator` when its entitlement is
 * enabled and removes it when disabled. Nothing else in the role changes, and a repeat changes
 * nothing. Not a wildcard: member use still needs its own grant.
 */
export async function syncModuleAdminKey(
  tx: TenantTransaction,
  module: Pick<Module, "identity" | "permissions">,
  enabled: boolean
): Promise<void> {
  const key = adminKeyOf(module);

  if (key === undefined) return;

  const held = sql`${key} = any(${role.permissions})`;

  await tx
    .update(role)
    .set({
      permissions: enabled
        ? sql`array_append(${role.permissions}, ${key})`
        : sql`array_remove(${role.permissions}, ${key})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(role.name, TENANT_ADMINISTRATOR_ROLE),
        eq(role.isSystem, true),
        enabled ? sql`not ${held}` : held
      )
    );
}

/**
 * The seeding the `roles` setup step (S2-08) calls (R-33, R-55): the two core system roles and
 * every compiled module's default roles, each marked system, then the admin key of every module
 * whose entitlement is enabled. A module registered disabled gets its definitions only.
 *
 * Seeding creates what is missing and never overwrites an existing role's permission array, so a
 * rerun, or a release that changed a declaration, does not broaden anyone (R-33a). A role is
 * matched by name; a display rename ships as an explicit migration first.
 */
export async function seedRoles(
  context: Pick<TenantContext, "db" | "entitlements">,
  modules: readonly Pick<Module, "identity" | "permissions" | "defaultRoles">[]
): Promise<void> {
  await context.db.transaction(async (tx) => {
    const definitions = [
      ...CORE_ROLES,
      ...modules.flatMap((module) =>
        module.defaultRoles.map((entry) => ({
          name: entry.name,
          permissions: [...entry.permissions],
          moduleId: module.identity.id,
          isSystem: true,
        }))
      ),
    ];

    await tx
      .insert(role)
      .values(definitions)
      .onConflictDoNothing({ target: role.name });

    for (const module of modules) {
      // Entitlements are read only through the context's reader (DEC-34).
      // oxlint-disable-next-line no-await-in-loop
      if (await context.entitlements.isEnabled(module.identity.id)) {
        // One statement at a time on the one transaction.
        // oxlint-disable-next-line no-await-in-loop
        await syncModuleAdminKey(tx, module, true);
      }
    }
  });
}

/** The local group setup seeds to hold `Tenant administrator` tenant-wide (R-55, DEC-23). */
export const GENIE_ADMINISTRATORS_GROUP = "Genie Administrators";

/**
 * R-55, DEC-23: the local group the first administrators belong to. It is found by its local
 * source and name, created once, and given `Tenant administrator` at the tenant-wide scope (a
 * null scope on both columns). The membership an administrator later adds carries source `local`,
 * which the identity-provider sync never touches (R-22, `access-model.md`, "The first
 * administrator"). Every write is a create-if-missing, so a rerun changes nothing and a rerun
 * after a crash completes the missing half.
 */
export async function seedGenieAdministrators(
  context: Pick<TenantContext, "db">
): Promise<void> {
  await context.db.transaction(async (tx) => {
    const [administratorRole] = await tx
      .select({ id: role.id })
      .from(role)
      .where(
        and(eq(role.name, TENANT_ADMINISTRATOR_ROLE), eq(role.isSystem, true))
      )
      .limit(1);

    if (administratorRole === undefined) {
      throw new Error(
        `the roles step cannot seed the ${GENIE_ADMINISTRATORS_GROUP} group before the ${TENANT_ADMINISTRATOR_ROLE} role exists`
      );
    }

    const [existing] = await tx
      .select({ id: group.id })
      .from(group)
      .where(
        and(
          eq(group.source, "local"),
          eq(group.name, GENIE_ADMINISTRATORS_GROUP)
        )
      )
      .limit(1);

    let groupId = existing?.id;

    if (groupId === undefined) {
      const [created] = await tx
        .insert(group)
        .values({ name: GENIE_ADMINISTRATORS_GROUP, source: "local" })
        .returning({ id: group.id });

      groupId = created?.id;
    }

    if (groupId === undefined) {
      throw new Error(
        `the roles step could not create the ${GENIE_ADMINISTRATORS_GROUP} group`
      );
    }

    await tx
      .insert(roleAssignment)
      .values({
        roleId: administratorRole.id,
        principalType: "group",
        principalId: groupId,
        scopeType: null,
        scopeId: null,
      })
      .onConflictDoNothing();
  });
}
