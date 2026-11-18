import { sql } from "drizzle-orm";

import type { Scope } from "../../lib/module-contract/keys.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { assignRoleInTransaction } from "../authorization/role-assignment.ts";
import { assertAdvancedAdds } from "./advanced.ts";
import {
  type AccessRecipient,
  assertManagesAllRoles,
  recipientDisabled,
} from "./effective-access.ts";
import type { RolesModule } from "./index.ts";

type AddInput = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly roleId: string;
  readonly scope: Scope | null;
  readonly recipients: readonly AccessRecipient[];
};

/**
 * The refusals of every add outside Grants and Advanced access: each recipient exists and is not
 * the break-glass account or an erased person (R-39, `not-found`), and a scoped add meets the scope
 * rule of Advanced access (AD5). The writer adds `module-disabled` and an unknown role. It writes
 * nothing and checks no key.
 */
export async function assertAssignable(input: AddInput): Promise<void> {
  // One recipient at a time, so the first refused one names the error.
  /* oxlint-disable no-await-in-loop */
  for (const recipient of input.recipients) {
    await recipientDisabled(input.tenant, recipient);
  }
  /* oxlint-enable no-await-in-loop */

  if (input.scope !== null) {
    await assertAdvancedAdds({
      tenant: input.tenant,
      caller: input.caller,
      modules: input.modules,
      add: [{ roleId: input.roleId, scope: input.scope }],
    });
  }
}

export type AddAssignmentsResult = {
  /** The new assignments, in input order. */
  readonly added: readonly {
    readonly recipient: AccessRecipient;
    readonly assignmentId: string;
  }[];
  /** Recipients that already held the role at that scope: nothing was written for them. */
  readonly skipped: readonly AccessRecipient[];
};

/**
 * Adds one role, at one record or the whole tenant, to many people and groups in one transaction
 * (d8l5.62, P12-5): a refused recipient or role writes nothing. A recipient given twice is written
 * once, and one that already holds the role at that scope is skipped. Every row goes through the
 * one assignment writer, which records the audit row and the granted events (DEC-39).
 */
export async function addAssignments(
  input: AddInput
): Promise<AddAssignmentsResult> {
  await assertManagesAllRoles(input.caller);

  const seen = new Set<string>();

  const recipients = input.recipients.filter((recipient) => {
    const key = `${recipient.type}\u0000${recipient.id}`;

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });

  await assertAssignable({ ...input, recipients });

  const { tenant, roleId, scope } = input;

  return withTransaction(tenant, async (tx) => {
    const added: AddAssignmentsResult["added"][number][] = [];
    const skipped: AccessRecipient[] = [];

    // One statement at a time on the one transaction.
    /* oxlint-disable no-await-in-loop */
    for (const recipient of recipients) {
      const held = await tx.execute(sql`
        select 1 from role_assignment
         where role_id = ${roleId}::uuid
           and principal_type = ${recipient.type}
           and principal_id = ${recipient.id}
           and scope_type is not distinct from ${scope?.type ?? null}
           and scope_id is not distinct from ${scope?.id ?? null}`);

      if (held.rows.length > 0) {
        skipped.push(recipient);
      } else {
        const { id } = await assignRoleInTransaction(tenant, tx, {
          actorUserId: input.caller.userId,
          roleId,
          principal: recipient,
          scope,
        });

        added.push({ recipient, assignmentId: id });
      }
    }
    /* oxlint-enable no-await-in-loop */

    return { added, skipped };
  });
}
