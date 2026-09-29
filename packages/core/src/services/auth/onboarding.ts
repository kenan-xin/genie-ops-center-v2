import { and, eq, inArray, isNull, sql } from "drizzle-orm";
/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-readable-spacing -- Better Auth owns this callback shape; per-user row locks serialize membership replacements. */

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { group, groupMember, roleAssignment, user } from "../../schema.ts";
import { writeAuthAuditEvent } from "../audit/index.ts";
import type { AuthRequestScope } from "./request-scope.ts";

type Validation = {
  readonly user: { readonly id?: string; readonly email?: string };
  readonly source: {
    readonly action?: string;
    readonly oauth?:
      | { readonly profile?: Record<string, unknown> | undefined }
      | undefined;
  };
};

/** D2-1 admission and ban gate. Refusals are recorded by the route after Better Auth rolls back. */
export async function validateOAuthUser(input: {
  readonly tenant: TenantContext;
  readonly scope: AuthRequestScope;
  readonly data: Validation;
}): Promise<
  { readonly error: "not_registered" | "access_disabled" } | undefined
> {
  const { data, scope, tenant } = input;
  const email = data.user.email ?? "";
  scope.capture(
    data.source.oauth?.profile?.groups,
    data.source.oauth?.profile?.genie_groups
  );

  if (data.source.action === "create-user") {
    const settings = await tenant.settings.get();
    if (settings.onboardingMode === "invite") {
      scope.refuse({ reason: "not_registered", email });
      return { error: "not_registered" };
    }
    const groups = scope.current()?.groups;
    if (!(await hasMappedGroup(tenant, groups))) {
      scope.refuse(
        groups === undefined
          ? { reason: "groups_claim_absent", email }
          : { reason: "no_mapped_group", email, groups: groups.slice(0, 20) }
      );
      return { error: "not_registered" };
    }
    return undefined;
  }

  if (
    (data.source.action === "link-account" ||
      data.source.action === "sign-in") &&
    data.user.id !== undefined
  ) {
    const rows = await tenant.db
      .select({ banned: user.banned })
      .from(user)
      .where(eq(user.id, data.user.id))
      .limit(1);
    if (rows[0]?.banned === true) {
      scope.refuse({ reason: "disabled", email });
      return { error: "access_disabled" };
    }
  }
  return undefined;
}

async function hasMappedGroup(
  tenant: TenantContext,
  claim: readonly string[] | undefined
): Promise<boolean> {
  if (claim === undefined || claim.length === 0) return false;
  const rows = await tenant.db
    .select({ id: group.id })
    .from(group)
    .innerJoin(
      roleAssignment,
      and(
        eq(roleAssignment.principalType, "group"),
        eq(roleAssignment.principalId, sql<string>`${group.id}::text`)
      )
    )
    .where(
      and(
        eq(group.source, "idp"),
        isNull(group.archivedAt),
        inArray(group.externalId, claim)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** The only writer of idp memberships (R-22). */
export async function syncGroupMemberships(
  tenant: TenantContext,
  userId: string,
  claim: readonly string[] | undefined
): Promise<void> {
  if (claim === undefined) {
    await writeAuthAuditEvent(tenant, {
      actorUserId: userId,
      action: "auth:groups_claim_absent",
      targetUserId: userId,
      summary: "Identity provider groups claim was absent",
      metadata: {},
    });
    return;
  }
  await tenant.db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");

    if (locked.length === 0)
      throw new Error("cannot sync groups for a missing person");

    await tx
      .delete(groupMember)
      .where(
        and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
      );
    if (claim.length === 0) return;
    const names = [...new Set(claim)];
    const now = new Date();
    await tx
      .insert(group)
      .values(
        names.map((externalId) => ({
          name: externalId,
          externalId,
          source: "idp",
          lastSeenAt: now,
        }))
      )
      .onConflictDoNothing();
    const rows = await tx
      .select({ id: group.id })
      .from(group)
      .where(and(eq(group.source, "idp"), inArray(group.externalId, names)));
    await tx
      .update(group)
      .set({ lastSeenAt: now })
      .where(and(eq(group.source, "idp"), inArray(group.externalId, names)));
    await tx
      .insert(groupMember)
      .values(rows.map(({ id }) => ({ groupId: id, userId, source: "idp" })))
      .onConflictDoNothing();
  });
}

export async function flushRefusalAudit(
  tenant: TenantContext,
  scope: AuthRequestScope
): Promise<void> {
  const refusal = scope.current()?.refusal;
  if (refusal === undefined) return;
  const metadata =
    refusal.groups === undefined
      ? { reason: refusal.reason, email: refusal.email }
      : {
          reason: refusal.reason,
          email: refusal.email,
          groups: refusal.groups,
        };
  await writeAuthAuditEvent(tenant, {
    actorUserId: null,
    action: "auth:sign_in_refused",
    summary: "Sign-in refused",
    metadata,
  });
}
