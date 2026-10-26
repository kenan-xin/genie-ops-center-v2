import { and, eq, isNull, sql } from "drizzle-orm";

import type { RecordTypeDeclaration } from "../../lib/module-contract/module.ts";
import { group, role, user } from "../../schema.ts";

/** The admin screen of a core record, opened with that record selected. */
function selectedPath(screen: string, id: string): string {
  return `${screen}?selected=${encodeURIComponent(id)}`;
}

/**
 * The record types core owns: a person, a group and a role. They resolve exactly like a module's
 * record types (module contract, Record types), so the audit reader names a live core target and
 * links its admin screen. Each names its own manage key as the path's permission, so a viewer
 * without that key sees the stored type and id only (R-69). They declare no parents. A group or
 * role id is compared as text, so a stored id that is not a uuid never reaches a cast.
 */
export const CORE_RECORD_TYPES: readonly RecordTypeDeclaration[] = [
  {
    type: "user",
    async resolve({ tenant }, id) {
      const [row] = await tenant.db
        .select({ name: user.name, isBreakGlass: user.isBreakGlass })
        .from(user)
        .where(and(eq(user.id, id), isNull(user.erasedAt)));

      if (row === undefined) return undefined;

      // The break-glass account is kept off the People screen (R-39): a label, nothing to open.
      if (row.isBreakGlass) {
        return { label: row.name, permission: "core:people:manage" };
      }

      return {
        label: row.name,
        path: selectedPath("/admin/people", id),
        permission: "core:people:manage",
      };
    },
  },
  {
    type: "group",
    async resolve({ tenant }, id) {
      const [row] = await tenant.db
        .select({ name: group.name, displayLabel: group.displayLabel })
        .from(group)
        .where(sql`${group.id}::text = ${id}`);

      if (row === undefined) return undefined;

      return {
        label: row.displayLabel ?? row.name,
        path: selectedPath("/admin/groups", id),
        permission: "core:groups:manage",
      };
    },
  },
  {
    type: "role",
    async resolve({ tenant }, id) {
      const [row] = await tenant.db
        .select({ name: role.name })
        .from(role)
        .where(sql`${role.id}::text = ${id}`);

      if (row === undefined) return undefined;

      return {
        label: row.name,
        path: selectedPath("/admin/roles", id),
        permission: "core:roles:manage",
      };
    },
  },
];
