import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { RequestPrincipal, RoleSummary } from "./principal.ts";

/**
 * One row of the account page's read-only Roles and access block (R-18): the role, its owning
 * module, how many keys it carries, the scope it was granted on, and the group it arrived
 * through - null for a direct assignment.
 */
export type RoleSummaryRow = RoleSummary;

/**
 * The roles summary of R-18. It reads the same tables the R-27 loader reads, through the same
 * context pool, and edits nothing: `role_assignment` joined to `role` and, for a group
 * principal, to the live group row that names it. A group that is archived keeps its rows for
 * the loader (R-32) but stops naming them here, because it no longer arrives anywhere.
 */
/**
 * Reads the person's role summary rows. The caller resolves each scoped row's display label
 * through the request principal's record resolver (R-28), so the module that owns the record
 * type names it.
 */
export async function readRoleSummaries(
  principal: RequestPrincipal
): Promise<readonly RoleSummaryRow[]> {
  return (await principal.grants()).roleSummaries ?? [];
}

/**
 * One group chip of the account page's Profile block (R-18): the group's name and whether it
 * arrived from the directory or was made locally.
 */
export type OwnGroup = {
  readonly id: string;
  readonly name: string;
  readonly source: "idp" | "local";
};

type OwnGroupRow = {
  readonly id: string;
  readonly name: string;
  readonly source: string;
};

/**
 * The person's live groups for the Profile block. An archived group keeps its rows for the
 * loader (R-32) but no longer names the person a member, so it is not listed here.
 */
export async function readOwnGroups(
  tenant: TenantContext,
  userId: string
): Promise<readonly OwnGroup[]> {
  // SAFETY: the statement below selects exactly the three columns this cast names, and the
  // pool returns unknown.
  const result = (await tenant.db.$client.query(
    `select g.id::text as id, g.name, g.source
       from group_member m
       join "group" g on g.id = m.group_id
      where m.user_id = $1 and g.archived_at is null
      order by g.name`,
    [userId]
  )) as { readonly rows: readonly OwnGroupRow[] };

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source === "idp" ? "idp" : "local",
  }));
}
