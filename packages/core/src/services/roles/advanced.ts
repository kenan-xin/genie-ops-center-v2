import { and, eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import { ASK_USER_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { roleAssignment } from "../../schema.ts";
import {
  assertAdministratorRemains,
  lockAdministratorGuard,
} from "../authorization/administrators.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import {
  assignRoleInTransaction,
  removeAssignmentInTransaction,
} from "../authorization/role-assignment.ts";
import {
  type AccessRecipient,
  assertManagesAllRoles,
  recipientDisabled,
} from "./effective-access.ts";
import type { RolesModule } from "./index.ts";

/** The staged changes of one Advanced access save for one recipient (R-37c). */
export type AdvancedChanges = {
  readonly add: readonly {
    readonly roleId: string;
    readonly scope: Scope | null;
  }[];
  readonly remove: readonly { readonly assignmentId: string }[];
};

type NamedRole = {
  readonly id: string;
  readonly name: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
};

const scopeKey = (roleId: string, scope: Scope | null) =>
  scope === null ? roleId : `${roleId}\u0000${scope.type}\u0000${scope.id}`;

/**
 * Whether Advanced access may add the role at the scope (AD5). A core system role other than
 * `Ask user` goes to the whole tenant; `Ask user` is a Grants row.
 */
function addable(role: NamedRole, scope: Scope | null): boolean {
  return (
    role.isSystem &&
    role.moduleId === null &&
    role.name !== ASK_USER_ROLE &&
    scope === null
  );
}

/**
 * Applies the Advanced access adds and removals for one recipient in one transaction (R-37c, AD4).
 * Every write goes through the one assignment writer (DEC-39), and the R-38 check runs once on the
 * final state. A refused entry refuses the whole save, and nothing is written.
 */
export async function saveAdvanced(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly recipient: AccessRecipient;
  readonly changes: AdvancedChanges;
}): Promise<void> {
  await assertManagesAllRoles(input.caller);
  // Refuses an erased person, the break-glass account and an unknown id (R-39).
  await recipientDisabled(input.tenant, input.recipient);

  const { add, remove } = input.changes;

  const removed = remove.map((entry) => entry.assignmentId);
  const added = add.map((entry) => scopeKey(entry.roleId, entry.scope));

  if (
    new Set(removed).size !== removed.length ||
    new Set(added).size !== added.length
  ) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  const named = await input.tenant.db.$client.query<NamedRole>(
    `select r.id::text as id, r.name, r.is_system as "isSystem", r.module_id as "moduleId"
       from role r where r.id = any($1::uuid[])`,
    [[...new Set(add.map((entry) => entry.roleId))]]
  );

  const roles = new Map(named.rows.map((row) => [row.id, row]));

  for (const entry of add) {
    const role = roles.get(entry.roleId);

    if (role === undefined) {
      throw new AppError(CORE_ERRORS["not-found"], {
        cause: new Error(`No role ${entry.roleId}`),
      });
    }

    if (!addable(role, entry.scope)) {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }
  }

  const { recipient } = input;
  const actorUserId = input.caller.userId;

  await withTransaction(input.tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    // One statement at a time on the one transaction.
    /* oxlint-disable no-await-in-loop */
    for (const entry of remove) {
      await removeAssignmentInTransaction(input.tenant, tx, {
        actorUserId,
        assignmentId: entry.assignmentId,
        expect: recipient,
      });
    }

    const held = new Set(
      (
        await tx
          .select({
            roleId: roleAssignment.roleId,
            scopeType: roleAssignment.scopeType,
            scopeId: roleAssignment.scopeId,
          })
          .from(roleAssignment)
          .where(
            and(
              eq(roleAssignment.principalType, recipient.type),
              eq(roleAssignment.principalId, recipient.id)
            )
          )
      ).map((row) =>
        scopeKey(
          row.roleId,
          row.scopeType !== null && row.scopeId !== null
            ? { type: row.scopeType, id: row.scopeId }
            : null
        )
      )
    );

    for (const entry of add) {
      // An add the recipient holds already, directly at the same scope, is skipped.
      if (!held.has(scopeKey(entry.roleId, entry.scope))) {
        await assignRoleInTransaction(input.tenant, tx, {
          actorUserId,
          roleId: entry.roleId,
          principal: recipient,
          scope: entry.scope,
        });
      }
    }
    /* oxlint-enable no-await-in-loop */

    // R-38: the one check, once, on the final state of the batch.
    if (remove.length > 0) await assertAdministratorRemains(tx);
  });
}
