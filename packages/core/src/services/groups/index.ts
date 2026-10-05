import { and, eq, inArray, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { group, groupMember } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";
import {
  assertAdministratorRemains,
  lockAdministratorGuard,
} from "../authorization/administrators.ts";
import { removeGroupAssignments } from "../authorization/role-assignment.ts";

/** One identity-provider group or one local group, as the Groups screen reads it. */
export type GroupRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "idp" | "local";
  readonly externalId: string | null;
  /** R-24c: shown in place of the value in lists and Access, never used for matching. */
  readonly displayLabel: string | null;
  readonly memberCount: number;
  readonly assignmentCount: number;
  /** R-24b: null until a sign-in lists the group, when the screen shows "Not seen yet". */
  readonly lastSeenAt: string | null;
  readonly archived: boolean;
  /** R-24a: computed on read, never stored. */
  readonly stale: boolean;
};

export type GroupMemberRow = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly source: "idp" | "local";
  readonly syncedAt: string | null;
};

export type GroupAssignmentRow = {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
};

export type GroupDetail = GroupRow & {
  readonly members: readonly GroupMemberRow[];
  readonly assignments: readonly GroupAssignmentRow[];
  /**
   * R-38: true when archiving or deleting this group would leave zero active tenant
   * administrators, so the inspector disables the action with the reason before the server refuses.
   */
  readonly lastAdministrator: boolean;
};

/** One role the group inspector may assign. */
export type AssignableRole = {
  readonly id: string;
  readonly name: string;
  readonly moduleId: string | null;
};

/** Every role a group may be given, system first then by name. */
export async function listAssignableRoles(
  tenant: TenantContext
): Promise<readonly AssignableRole[]> {
  const result = await tenant.db.$client.query(
    `select r.id::text as id, r.name, r.module_id as "moduleId"
       from role r
      order by r.is_system desc, lower(r.name)`
  );

  // SAFETY: the statement selects exactly these three columns.
  return result.rows as readonly AssignableRole[];
}

/**
 * The one read shape of the Groups screen. `stale` compares the group's `last_seen_at` with the
 * newest directory sync anywhere in the tenant: the sync stamps every group it sees, so a group
 * the provider stopped sending falls behind and is shown stale, while a group no sign-in has ever
 * listed (`last_seen_at` null) is "Not seen yet", not stale (R-24a, R-24b).
 */
const GROUP_COLUMNS = `
  g.id::text as "id",
  g.name,
  coalesce(g.description, '') as description,
  g.source,
  g.external_id as "externalId",
  g.display_label as "displayLabel",
  (select count(*) from group_member m join "user" u on u.id = m.user_id
     where m.group_id = g.id and u.is_break_glass = false)::int as "memberCount",
  (select count(*) from role_assignment a
     where a.principal_type = 'group' and a.principal_id = g.id::text)::int as "assignmentCount",
  g.last_seen_at::text as "lastSeenAt",
  (g.archived_at is not null) as archived,
  (g.source = 'idp'
     and g.last_seen_at is not null
     and g.last_seen_at < coalesce(
       (select max(m2.synced_at) from group_member m2 where m2.source = 'idp'),
       g.last_seen_at)) as stale`;

type RawGroup = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly externalId: string | null;
  readonly displayLabel: string | null;
  readonly memberCount: number;
  readonly assignmentCount: number;
  readonly lastSeenAt: string | null;
  readonly archived: boolean;
  readonly stale: boolean;
};

function normalizeGroup(row: RawGroup): GroupRow {
  return {
    ...row,
    source: row.source === "idp" ? "idp" : "local",
    stale: row.stale === true,
    archived: row.archived === true,
    memberCount: Number(row.memberCount),
    assignmentCount: Number(row.assignmentCount),
  };
}

/** The Groups list, archived groups hidden unless asked for (design: Show archived). */
export async function listGroups(
  tenant: TenantContext,
  options: { readonly includeArchived: boolean }
): Promise<readonly GroupRow[]> {
  const result = await tenant.db.$client.query(
    `select ${GROUP_COLUMNS}
       from "group" g
      where ($1::boolean or g.archived_at is null)
      order by (g.archived_at is not null), lower(coalesce(g.display_label, g.name))`,
    [options.includeArchived]
  );

  // SAFETY: the statement selects exactly the group columns.
  return (result.rows as readonly RawGroup[]).map(normalizeGroup);
}

async function readGroupRow(
  tenant: TenantContext,
  groupId: string
): Promise<GroupRow | undefined> {
  const result = await tenant.db.$client.query(
    `select ${GROUP_COLUMNS} from "group" g where g.id = $1::uuid`,
    [groupId]
  );

  // SAFETY: the statement selects exactly the group columns.
  const [row] = result.rows as readonly RawGroup[];

  return row === undefined ? undefined : normalizeGroup(row);
}

/** One group with its members and its role assignments, for the inspector. */
export async function readGroup(
  tenant: TenantContext,
  groupId: string
): Promise<GroupDetail | undefined> {
  const row = await readGroupRow(tenant, groupId);

  if (row === undefined) return undefined;

  const members = await tenant.db.$client.query(
    `select u.id, u.name, u.email, m.source, m.synced_at::text as "syncedAt"
       from group_member m
       join "user" u on u.id = m.user_id
      where m.group_id = $1::uuid
        -- R-39: the break-glass account appears only in the audit log.
        and u.is_break_glass = false
      order by lower(u.name), lower(u.email)`,
    [groupId]
  );

  const assignments = await tenant.db.$client.query(
    `select a.id::text as id, a.role_id::text as "roleId", r.name as "roleName",
            a.scope_type as "scopeType", a.scope_id as "scopeId"
       from role_assignment a
       join role r on r.id = a.role_id
      where a.principal_type = 'group' and a.principal_id = $1
      order by lower(r.name)`,
    [groupId]
  );

  // SAFETY: the member statement selects exactly the member columns.
  const memberRows = members.rows as readonly GroupMemberRow[];

  // SAFETY: the assignment statement selects exactly the assignment columns.
  const assignmentRows = assignments.rows as readonly GroupAssignmentRow[];

  return {
    ...row,
    members: memberRows,
    assignments: assignmentRows,
    lastAdministrator: await isLastAdministratorPath(tenant, groupId),
  };
}

/**
 * R-38: true when no active tenant administrator would remain if this group stopped granting.
 * The count excludes every path through this group, so a group that carries the role but shares
 * the tenant with another administrator is not the last path.
 */
async function isLastAdministratorPath(
  tenant: TenantContext,
  groupId: string
): Promise<boolean> {
  const result = await tenant.db.$client.query(
    `select count(distinct u.id)::int as count
       from "user" u
      where u.status = 'active'
        and u.banned is not true
        and u.erased_at is null
        and u.is_break_glass = false
        and (
          exists (
            select 1 from role_assignment a
              join role r on r.id = a.role_id
             where r.name = $1 and r.is_system = true
               and a.principal_type = 'user' and a.principal_id = u.id
          )
          or exists (
            select 1
              from group_member m
              join "group" g
                on g.id = m.group_id and g.archived_at is null and g.id <> $2::uuid
              join role_assignment a
                on a.principal_type = 'group' and a.principal_id = g.id::text
              join role r on r.id = a.role_id
             where m.user_id = u.id and r.name = $1 and r.is_system = true
          )
        )`,
    [TENANT_ADMINISTRATOR_ROLE, groupId]
  );

  // SAFETY: the statement selects one `::int` count.
  const rows = result.rows as readonly { count: number }[];

  return (rows[0]?.count ?? 0) === 0;
}

async function loadGroupForWrite(
  tx: TenantTransaction,
  groupId: string
): Promise<{
  readonly id: string;
  readonly source: string;
  readonly lastSeenAt: Date | null;
  readonly archivedAt: Date | null;
}> {
  const rows = await tx
    .select({
      id: group.id,
      source: group.source,
      lastSeenAt: group.lastSeenAt,
      archivedAt: group.archivedAt,
    })
    .from(group)
    .where(eq(group.id, groupId))
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No group ${groupId}`),
    });
  }

  return row;
}

/**
 * R-24b, DEC-52: add a directory group by the exact value the provider puts in the `groups`
 * claim. The row carries source `idp`, that value as `external_id` and a null `last_seen_at`, so
 * the screen shows it as "Not seen yet"; the sync then finds the same row by claim value.
 */
export async function addDirectoryGroup(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly externalId: string;
    readonly displayLabel?: string | null;
  }
): Promise<string> {
  // The provider's claim value is matched exactly, so it is stored exactly: surrounding
  // whitespace is part of the value, not something to normalize away (R-24b, DEC-52). Only an
  // empty value is refused.
  const externalId = input.externalId;

  if (externalId === "") {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  return withTransaction(tenant, async (tx) => {
    const existing = await tx
      .select({ id: group.id })
      .from(group)
      .where(and(eq(group.source, "idp"), eq(group.externalId, externalId)))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(CORE_ERRORS["directory-group-exists"]);
    }

    const [row] = await tx
      .insert(group)
      .values({
        name: externalId,
        externalId,
        source: "idp",
        displayLabel: input.displayLabel?.trim() || null,
      })
      .returning({ id: group.id });

    if (row === undefined) throw new Error("the group insert returned no row");

    await writeAdminAuditEvent(tx, {
      action: "core:directory_group_added",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: row.id,
      summary: `Added the directory group ${externalId}`,
      metadata: { externalId, displayLabel: input.displayLabel ?? null },
    });

    return row.id;
  });
}

/** R-25: delete a directory group the sync has never filled. A seen group can only be archived. */
export async function deleteDirectoryGroup(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly groupId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "idp" || current.lastSeenAt !== null) {
      throw new AppError(CORE_ERRORS["group-seen"]);
    }

    await removeGroupAssignments(tenant, tx, {
      actorUserId: input.actorUserId,
      groupId: input.groupId,
    });

    await tx.delete(group).where(eq(group.id, input.groupId));

    // Removing the group can remove the last administrator path.
    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:directory_group_deleted",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: "Deleted a directory group that no sign-in had listed",
    });
  });
}

/**
 * R-32: archive a directory group. Its assignments and members are kept and stop granting, and
 * the caller names how many assignments stop, so archiving is the safe retirement.
 */
export async function archiveDirectoryGroup(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly groupId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "idp") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    if (current.archivedAt !== null) return;

    await tx
      .update(group)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(group.id, input.groupId));

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:group_archived",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: "Archived a directory group",
    });
  });
}

/** R-24c: set or clear a directory group's display label. The label is never used for matching. */
export async function setGroupLabel(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly groupId: string;
    readonly displayLabel: string | null;
  }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "idp") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    const label = input.displayLabel?.trim() || null;

    await tx
      .update(group)
      .set({ displayLabel: label, updatedAt: sql`now()` })
      .where(eq(group.id, input.groupId));

    await writeAdminAuditEvent(tx, {
      action: "core:group_label_changed",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary:
        label === null
          ? "Cleared a group display label"
          : `Set the group display label to ${label}`,
      metadata: { displayLabel: label },
    });
  });
}

/** R-24, R-25: create a local group. Its rows carry source `local` and the sync never touches them. */
export async function createLocalGroup(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly name: string;
    readonly description?: string | undefined;
  }
): Promise<string> {
  const name = input.name.trim();

  if (name === "") throw new AppError(CORE_ERRORS["invalid-input"]);

  return withTransaction(tenant, async (tx) => {
    const [row] = await tx
      .insert(group)
      .values({
        name,
        description: input.description?.trim() || null,
        source: "local",
      })
      .returning({ id: group.id });

    if (row === undefined) throw new Error("the group insert returned no row");

    await writeAdminAuditEvent(tx, {
      action: "core:local_group_added",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: row.id,
      summary: `Created the local group ${name}`,
      metadata: { name },
    });

    return row.id;
  });
}

/** Edit a local group's name and description. A directory group is never edited here. */
export async function updateLocalGroup(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly groupId: string;
    readonly name: string;
    readonly description?: string | undefined;
  }
): Promise<void> {
  const name = input.name.trim();

  if (name === "") throw new AppError(CORE_ERRORS["invalid-input"]);

  await withTransaction(tenant, async (tx) => {
    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "local") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    await tx
      .update(group)
      .set({
        name,
        description: input.description?.trim() || null,
        updatedAt: sql`now()`,
      })
      .where(eq(group.id, input.groupId));

    await writeAdminAuditEvent(tx, {
      action: "core:local_group_updated",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: `Updated the local group ${name}`,
      metadata: { name },
    });
  });
}

/**
 * R-25: delete a local group after a confirm that names its member and assignment counts. The
 * memberships and the group's assignments go with it, and the last-administrator rule is checked.
 */
export async function deleteLocalGroup(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly groupId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "local") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    await removeGroupAssignments(tenant, tx, {
      actorUserId: input.actorUserId,
      groupId: input.groupId,
    });

    await tx.delete(groupMember).where(eq(groupMember.groupId, input.groupId));
    await tx.delete(group).where(eq(group.id, input.groupId));

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:local_group_deleted",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: "Deleted a local group with its members and assignments",
    });
  });
}

/** R-24: add people to a local group. A directory group's membership is the provider's. */
export async function addLocalGroupMembers(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly groupId: string;
    readonly userIds: readonly string[];
  }
): Promise<void> {
  const userIds = [...new Set(input.userIds)];

  if (userIds.length === 0) return;

  await withTransaction(tenant, async (tx) => {
    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "local") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    await tx
      .insert(groupMember)
      .values(
        userIds.map((userId) => ({
          groupId: input.groupId,
          userId,
          source: "local",
        }))
      )
      .onConflictDoNothing();

    await writeAdminAuditEvent(tx, {
      action: "core:group_member_added",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: `Added ${userIds.length} member(s) to a local group`,
      metadata: { userIds },
    });
  });
}

/**
 * Remove one or more people from a local group. The last-administrator rule applies, because a
 * membership is one path to a role the group carries.
 */
export async function removeLocalGroupMembers(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly groupId: string;
    readonly userIds: readonly string[];
  }
): Promise<void> {
  const userIds = [...new Set(input.userIds)];

  if (userIds.length === 0) return;

  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "local") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    await tx
      .delete(groupMember)
      .where(
        and(
          eq(groupMember.groupId, input.groupId),
          inArray(groupMember.userId, userIds)
        )
      );

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:group_member_removed",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: `Removed ${userIds.length} member(s) from a local group`,
      metadata: { userIds },
    });
  });
}

/** Remove every member of a local group (the Members tab's Remove all). */
export async function removeAllLocalGroupMembers(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly groupId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const current = await loadGroupForWrite(tx, input.groupId);

    if (current.source !== "local") {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    await tx.delete(groupMember).where(eq(groupMember.groupId, input.groupId));

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:group_members_removed",
      actorUserId: input.actorUserId,
      targetType: "group",
      targetId: input.groupId,
      summary: "Removed every member from a local group",
    });
  });
}
