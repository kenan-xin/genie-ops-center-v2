import type { TenantContext } from "../../lib/tenant-context/index.ts";

/**
 * One row of the account page's read-only Roles and access block (R-18): the role, its owning
 * module, how many keys it carries, the scope it was granted on, and the group it arrived
 * through - null for a direct assignment.
 */
export type RoleSummaryRow = {
  readonly roleName: string;
  readonly moduleName: string | null;
  readonly permissionCount: number;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  /** The group name the grant came through, or null for a direct assignment (R-18). */
  readonly via: string | null;
};

/**
 * The roles summary of R-18. It reads the same tables the R-27 loader reads, through the same
 * context pool, and edits nothing: `role_assignment` joined to `role` and, for a group
 * principal, to the live group row that names it. A group that is archived keeps its rows for
 * the loader (R-32) but stops naming them here, because it no longer arrives anywhere.
 */
const SUMMARY_SQL = `
  select r.name as role_name, r.module_id as module_name,
         coalesce(cardinality(r.permissions), 0) as permission_count,
         a.scope_type, a.scope_id,
         case when a.principal_type = 'group' then g.name end as via
    from role_assignment a
    join role r on r.id = a.role_id
    left join "group" g
      on a.principal_type = 'group' and g.id = a.principal_id::uuid and g.archived_at is null
   where (a.principal_type = 'user' and a.principal_id = $1)
      or (a.principal_type = 'group' and a.principal_id in (
            select m.group_id::text
              from group_member m
              join "group" g2 on g2.id = m.group_id
             where m.user_id = $1 and g2.archived_at is null))
   order by r.name, via nulls first`;

type SummaryQueryResult = {
  readonly rows: readonly {
    readonly role_name: string;
    readonly module_name: string | null;
    readonly permission_count: number | string | null;
    readonly scope_type: string | null;
    readonly scope_id: string | null;
    readonly via: string | null;
  }[];
};

/**
 * Reads the person's role summary rows. The caller resolves each scoped row's display label
 * through the request principal's record resolver (R-28), so the module that owns the record
 * type names it.
 */
export async function readRoleSummaries(
  tenant: TenantContext,
  userId: string
): Promise<readonly RoleSummaryRow[]> {
  // SAFETY: the statement above sends `SUMMARY_SQL`, whose select list is exactly the row this
  // cast names; the pool returns unknown and the query is this module's own.
  const result = (await tenant.db.$client.query(SUMMARY_SQL, [
    userId,
  ])) as SummaryQueryResult;

  return result.rows.map((row) => ({
    roleName: row.role_name,
    moduleName: row.module_name,
    permissionCount: Number(row.permission_count ?? 0),
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    via: row.via,
  }));
}
