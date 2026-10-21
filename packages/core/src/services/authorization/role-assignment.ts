import { and, eq, sql } from "drizzle-orm";

import {
  coreRoleGranted,
  coreRoleRevoked,
} from "../../../contracts/identity.ts";
import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { role, roleAssignment } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";
import {
  assertAdministratorRemains,
  lockAdministratorGuard,
} from "./administrators.ts";

/** The principal one assignment names: a person or a group. */
export type AssignmentPrincipal = {
  readonly type: "user" | "group";
  readonly id: string;
};

/**
 * The one writer of `role_assignment` (DEC-39, R-40). The Access screen, Add person and the
 * groups router all reach it, and nothing else inserts, updates or deletes an assignment. It
 * enforces the R-38 self-protection rule and emits `core:role:granted` / `core:role:revoked` for
 * every person the change reaches (R-47), so the email and the in-app notification have one path.
 */
export type AssignmentWrite = {
  readonly tenant: TenantContext;
  readonly actorUserId: string;
  readonly roleId: string;
  readonly principal: AssignmentPrincipal;
  readonly scope?: Scope | null;
};

/** One person a change reaches, as the event payload carries them. */
type AffectedPerson = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
};

async function roleNameOf(
  tx: TenantTransaction,
  roleId: string
): Promise<string> {
  const rows = await tx
    .select({ name: role.name })
    .from(role)
    .where(eq(role.id, roleId))
    .limit(1);

  const name = rows[0]?.name;

  if (name === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No role ${roleId}`),
    });
  }

  return name;
}

/**
 * The people one assignment change reaches. A direct assignment reaches the person; a group
 * assignment reaches every member, because the group is the path and the role arrives at each of
 * them.
 */
async function affectedPeople(
  tx: TenantTransaction,
  principal: AssignmentPrincipal
): Promise<readonly AffectedPerson[]> {
  if (principal.type === "user") {
    const result = await tx.execute<AffectedPerson>(sql`
      select id, email, name from "user" where id = ${principal.id}
    `);

    return result.rows;
  }

  const result = await tx.execute<AffectedPerson>(sql`
    select u.id, u.email, u.name
      from group_member m
      join "user" u on u.id = m.user_id
     where m.group_id = ${principal.id}::uuid
  `);

  return result.rows;
}

/** Emits the role event for each reached person, on the caller's transaction (R-47). */
async function emitRoleEvents(
  tenant: TenantContext,
  tx: TenantTransaction,
  event: typeof coreRoleGranted | typeof coreRoleRevoked,
  roleName: string,
  people: readonly AffectedPerson[]
): Promise<void> {
  for (const person of people) {
    // Events are emitted one at a time on the caller's transaction connection.
    // oxlint-disable-next-line no-await-in-loop
    await tenant.events.emit(tx, event, {
      userId: person.id,
      email: person.email,
      name: person.name,
      roleName,
    });
  }
}

/**
 * Writes one assignment on a caller-supplied transaction. Add person calls this in the same
 * transaction as the `user` row, so the person and the picked roles are saved together or not at
 * all (R-40, B1); every other caller reaches it through {@link assignRole}. It is still the one
 * writer of `role_assignment`: nothing else inserts an assignment.
 */
export async function assignRoleInTransaction(
  tenant: TenantContext,
  tx: TenantTransaction,
  input: Omit<AssignmentWrite, "tenant">
): Promise<{ readonly id: string }> {
  await lockAdministratorGuard(tx);

  const roleName = await roleNameOf(tx, input.roleId);

  const [row] = await tx
    .insert(roleAssignment)
    .values({
      roleId: input.roleId,
      principalType: input.principal.type,
      principalId: input.principal.id,
      scopeType: input.scope?.type ?? null,
      scopeId: input.scope?.id ?? null,
      createdByUserId: input.actorUserId,
    })
    .returning({ id: roleAssignment.id });

  if (row === undefined) {
    throw new Error("the role assignment insert returned no row");
  }

  await writeAdminAuditEvent(tx, {
    action: "core:role_assignment_added",
    actorUserId: input.actorUserId,
    targetType: "role-assignment",
    targetId: row.id,
    summary: `Granted the ${roleName} role to ${input.principal.type} ${input.principal.id}`,
    metadata: {
      roleId: input.roleId,
      principalType: input.principal.type,
      principalId: input.principal.id,
      scopeType: input.scope?.type ?? null,
      scopeId: input.scope?.id ?? null,
    },
  });

  await emitRoleEvents(
    tenant,
    tx,
    coreRoleGranted,
    roleName,
    await affectedPeople(tx, input.principal)
  );

  return { id: row.id };
}

/**
 * Writes one assignment in its own transaction. The unique row is the database's own rule: two
 * identical tenant-wide grants cannot exist, so a repeat fails on the constraint rather than
 * silently doubling.
 */
export async function assignRole(
  input: AssignmentWrite
): Promise<{ readonly id: string }> {
  return withTransaction(input.tenant, (tx) =>
    assignRoleInTransaction(input.tenant, tx, {
      actorUserId: input.actorUserId,
      roleId: input.roleId,
      principal: input.principal,
      scope: input.scope ?? null,
    })
  );
}

/**
 * Removes every direct assignment a person holds, in the caller's transaction, for Remove person
 * (R-43). It shares the service's audit action and `core:role:revoked` emission, so a bulk removal
 * and a single one leave the same trail; group-held assignments are not touched, because a
 * membership change is what removes those.
 */
export async function removeUserAssignments(
  tenant: TenantContext,
  tx: TenantTransaction,
  input: {
    readonly actorUserId: string;
    readonly userId: string;
  }
): Promise<void> {
  const rows = await tx
    .select({ id: roleAssignment.id, roleId: roleAssignment.roleId })
    .from(roleAssignment)
    .where(
      and(
        eq(roleAssignment.principalType, "user"),
        eq(roleAssignment.principalId, input.userId)
      )
    );

  const people = await affectedPeople(tx, { type: "user", id: input.userId });

  for (const row of rows) {
    // One statement at a time on the one transaction.
    // oxlint-disable-next-line no-await-in-loop
    await tx.delete(roleAssignment).where(eq(roleAssignment.id, row.id));

    // oxlint-disable-next-line no-await-in-loop
    const roleName = await roleNameOf(tx, row.roleId);

    // oxlint-disable-next-line no-await-in-loop
    await writeAdminAuditEvent(tx, {
      action: "core:role_assignment_removed",
      actorUserId: input.actorUserId,
      targetType: "role-assignment",
      targetId: row.id,
      summary: `Removed the ${roleName} role from user ${input.userId}`,
      metadata: {
        roleId: row.roleId,
        principalType: "user",
        principalId: input.userId,
      },
    });

    // oxlint-disable-next-line no-await-in-loop
    await emitRoleEvents(tenant, tx, coreRoleRevoked, roleName, people);
  }
}

/** Removes one assignment by id, refusing the R-38 cases and emitting `core:role:revoked`. */
export async function removeAssignment(input: {
  readonly tenant: TenantContext;
  readonly actorUserId: string;
  readonly assignmentId: string;
  /**
   * When set, the assignment must belong to this principal, checked in the same transaction as the
   * deletion. A caller that edits one group's grants (the Groups screen) passes the group here, so
   * an id belonging to a person or another group is refused rather than removed.
   */
  readonly expect?: AssignmentPrincipal;
}): Promise<void> {
  await withTransaction(input.tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const rows = await tx
      .select({
        id: roleAssignment.id,
        roleId: roleAssignment.roleId,
        principalType: roleAssignment.principalType,
        principalId: roleAssignment.principalId,
      })
      .from(roleAssignment)
      .where(eq(roleAssignment.id, input.assignmentId))
      .limit(1);

    const assignment = rows[0];

    if (assignment === undefined) {
      throw new AppError(CORE_ERRORS["not-found"], {
        cause: new Error(`No assignment ${input.assignmentId}`),
      });
    }

    if (
      input.expect !== undefined &&
      (assignment.principalType !== input.expect.type ||
        assignment.principalId !== input.expect.id)
    ) {
      // A foreign assignment id is answered as not found: it reveals nothing about another
      // principal's grants, and this Groups action may only change its own group's rows.
      throw new AppError(CORE_ERRORS["not-found"], {
        cause: new Error(
          `Assignment ${input.assignmentId} is not the expected principal`
        ),
      });
    }

    const roleName = await roleNameOf(tx, assignment.roleId);

    // R-38 self-protection: an administrator may not remove their own tenant administrator
    // access. Another administrator may.
    if (
      roleName === TENANT_ADMINISTRATOR_ROLE &&
      assignment.principalType === "user" &&
      assignment.principalId === input.actorUserId
    ) {
      throw new AppError(CORE_ERRORS["self-protection"]);
    }

    await tx
      .delete(roleAssignment)
      .where(eq(roleAssignment.id, input.assignmentId));

    // The deletion is visible on this transaction, so the count is the after-state.
    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:role_assignment_removed",
      actorUserId: input.actorUserId,
      targetType: "role-assignment",
      targetId: input.assignmentId,
      summary: `Removed the ${roleName} role from ${assignment.principalType} ${assignment.principalId}`,
      metadata: {
        roleId: assignment.roleId,
        principalType: assignment.principalType,
        principalId: assignment.principalId,
      },
    });

    await emitRoleEvents(
      input.tenant,
      tx,
      coreRoleRevoked,
      roleName,
      await affectedPeople(tx, {
        type: assignment.principalType === "group" ? "group" : "user",
        id: assignment.principalId,
      })
    );
  });
}

/**
 * Removes every assignment a group holds, in the caller's transaction, for the group-deleting
 * writers. It shares the service's audit action and event emission so a group delete and a single
 * removal leave the same trail, and it returns the people reached so the caller can emit nothing
 * twice.
 */
export async function removeGroupAssignments(
  tenant: TenantContext,
  tx: TenantTransaction,
  input: {
    readonly actorUserId: string;
    readonly groupId: string;
  }
): Promise<void> {
  const rows = await tx
    .select({ id: roleAssignment.id, roleId: roleAssignment.roleId })
    .from(roleAssignment)
    .where(
      and(
        eq(roleAssignment.principalType, "group"),
        eq(roleAssignment.principalId, input.groupId)
      )
    );

  const people = await affectedPeople(tx, {
    type: "group",
    id: input.groupId,
  });

  for (const row of rows) {
    // One statement at a time on the one transaction.
    // oxlint-disable-next-line no-await-in-loop
    await tx.delete(roleAssignment).where(eq(roleAssignment.id, row.id));

    // oxlint-disable-next-line no-await-in-loop
    const roleName = await roleNameOf(tx, row.roleId);

    // oxlint-disable-next-line no-await-in-loop
    await writeAdminAuditEvent(tx, {
      action: "core:role_assignment_removed",
      actorUserId: input.actorUserId,
      targetType: "role-assignment",
      targetId: row.id,
      summary: `Removed the ${roleName} role from group ${input.groupId}`,
      metadata: {
        roleId: row.roleId,
        principalType: "group",
        principalId: input.groupId,
      },
    });

    // oxlint-disable-next-line no-await-in-loop
    await emitRoleEvents(tenant, tx, coreRoleRevoked, roleName, people);
  }
}
