import { and, eq, inArray, isNull } from "drizzle-orm";
/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-readable-spacing -- Better Auth owns this callback shape; sequential writes preserve membership consistency. */

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  auditEvent,
  group,
  groupMember,
  roleAssignment,
  user,
} from "../../schema.ts";
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
  scope.capture(data.source.oauth?.profile?.groups);

  if (data.source.action === "create-user") {
    const settings = await tenant.settings.get();
    if (
      settings.onboardingMode === "invite" ||
      !(await hasMappedGroup(tenant, scope.current()?.groups))
    ) {
      scope.refuse("not_registered", email);
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
      scope.refuse("access_disabled", email);
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
        eq(roleAssignment.principalId, group.id)
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
    await tenant.db.insert(auditEvent).values({
      actorUserId: userId,
      action: "auth:groups_claim_absent",
      targetType: "user",
      targetId: userId,
      summary: "Identity provider groups claim was absent",
      metadata: {},
    });
    return;
  }
  await tenant.db.transaction(async (tx) => {
    await tx
      .delete(groupMember)
      .where(
        and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
      );
    if (claim.length === 0) return;
    /* oxlint-disable no-await-in-loop -- one transaction serializes the replace and upsert sequence. */
    for (const externalId of claim) {
      const found = await tx
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.source, "idp"), eq(group.externalId, externalId)))
        .limit(1);
      const id =
        found[0]?.id ??
        (
          await tx
            .insert(group)
            .values({
              name: externalId,
              externalId,
              source: "idp",
              lastSeenAt: new Date(),
            })
            .returning({ id: group.id })
        )[0]?.id;
      if (id !== undefined)
        await tx
          .insert(groupMember)
          .values({ groupId: id, userId, source: "idp" });
    }
  });
}

export async function flushRefusalAudit(
  tenant: TenantContext,
  scope: AuthRequestScope
): Promise<void> {
  const refusal = scope.current()?.refusal;
  if (refusal === undefined) return;
  await tenant.db.insert(auditEvent).values({
    actorUserId: null,
    action: "auth:sign_in_refused",
    targetType: "user",
    targetId: null,
    summary: "Sign-in refused",
    metadata: { reason: refusal.reason, email: refusal.email },
  });
}
