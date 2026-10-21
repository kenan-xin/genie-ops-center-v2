import { sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";

/**
 * The R-38 self-protection check. Every writer that could remove the last path to a tenant
 * administrator takes the lock and calls {@link assertAdministratorRemains} after its mutation,
 * inside the same transaction: the mutation that empties the tenant is rolled back with the
 * refusal, so no screen and no procedure can ever leave the tenant without an administrator.
 *
 * The rule counts people, never assignment rows (`../design/sections/people-groups-and-roles/
 * spec.md`, "User Flows"): only a `status = 'active'`, not banned, not erased person counts; a
 * path through an archived group counts for nobody; and two paths to one person are still one
 * person. The break-glass account is excluded, because R-39 keeps it off these screens and its
 * authority is the bypass, not a role assignment.
 */

/**
 * A transaction-scoped advisory lock keyed to the administrator guard. It serializes every
 * mutation that can change who administers the tenant, so two concurrent removals cannot each
 * count the other's holder and both proceed. Released when the transaction ends.
 */
export async function lockAdministratorGuard(
  tx: TenantTransaction
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('core:tenant-administrator'))`
  );
}

/**
 * The number of distinct people who can administer the tenant right now: an active, not banned,
 * not erased, non-break-glass person holding `Tenant administrator` directly or through a
 * non-archived group.
 */
export async function countActiveAdministrators(
  tx: TenantTransaction
): Promise<number> {
  const result = await tx.execute<{ count: number }>(sql`
    select count(distinct u.id)::int as count
      from "user" u
     where u.status = 'active'
       and u.banned is not true
       and u.erased_at is null
       and u.is_break_glass = false
       and (
         exists (
           select 1
             from role_assignment a
             join role r on r.id = a.role_id
            where r.name = ${TENANT_ADMINISTRATOR_ROLE}
              and r.is_system = true
              and a.principal_type = 'user'
              and a.principal_id = u.id
         )
         or exists (
           select 1
             from group_member m
             join "group" g on g.id = m.group_id and g.archived_at is null
             join role_assignment a
               on a.principal_type = 'group' and a.principal_id = g.id::text
             join role r on r.id = a.role_id
            where m.user_id = u.id
              and r.name = ${TENANT_ADMINISTRATOR_ROLE}
              and r.is_system = true
         )
       )
  `);

  return result.rows[0]?.count ?? 0;
}

/** Refuses with the stable `last-administrator` code when no active administrator would remain. */
export async function assertAdministratorRemains(
  tx: TenantTransaction
): Promise<void> {
  if ((await countActiveAdministrators(tx)) === 0) {
    throw new AppError(CORE_ERRORS["last-administrator"]);
  }
}

/**
 * R-38: no person may disable or remove themselves. The acting administrator is compared with the
 * target person. The `self-protection` code is the stable refusal the screen mirrors.
 */
export function assertNotSelf(actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) {
    throw new AppError(CORE_ERRORS["self-protection"]);
  }
}
