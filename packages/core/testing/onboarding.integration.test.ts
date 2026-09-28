import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  account,
  auditEvent,
  group,
  groupMember,
  notification,
  tenantSettings,
  user,
} from "../src/schema.ts";
import {
  flushRefusalAudit,
  syncGroupMemberships,
  validateOAuthUser,
} from "../src/services/auth/onboarding.ts";
import { recordOAuthSignIn } from "../src/services/auth/session-events.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

async function check(
  deployment: DisposableDeployment,
  action: "create-user" | "link-account" | "sign-in",
  groups: readonly string[] | undefined,
  id?: string
) {
  const scope = deployment.context.authRequestScope;
  const email = `${randomUUID()}@example.invalid`;
  const profile = groups === undefined ? {} : { groups };
  const person = id === undefined ? { email } : { id, email };

  return scope.run(async () => {
    const result = await validateOAuthUser({
      tenant: deployment.context,
      scope,
      data: { user: person, source: { action, oauth: { profile } } },
    });

    return { result, email, facts: scope.current() };
  });
}

describe("OAuth onboarding and group sync against Postgres", () => {
  let invite: DisposableDeployment;
  let jit: DisposableDeployment;

  beforeAll(async () => {
    [invite, jit] = await Promise.all([
      startDisposableDeployment(),
      startDisposableDeployment(),
    ]);
    await invite.context.db
      .insert(tenantSettings)
      .values({ onboardingMode: "invite" });
    await jit.context.db
      .insert(tenantSettings)
      .values({ onboardingMode: "jit" });
  }, 240_000);

  afterAll(async () => {
    await Promise.all([invite?.stop(), jit?.stop()]);
  });

  it("invite mode refuses a new OAuth person before a user or account exists", async () => {
    const result = await check(invite, "create-user", ["Team"]);
    expect(result.result).toEqual({ error: "not_registered" });
    expect(result.facts?.refusal?.reason).toBe("not_registered");
  });

  it("jit admits only a non-archived directory group with a role assignment", async () => {
    const roleId = await insertRole(jit.context, { permissions: [] });

    const mappedId = await insertGroup(jit.context, [], {
      source: "idp",
      externalId: "Mapped",
      lastSeenAt: null,
    });

    await assignRole(jit.context, {
      roleId,
      principal: { type: "group", id: mappedId },
    });

    expect(
      (await check(jit, "create-user", ["Mapped"])).result
    ).toBeUndefined();
    expect(
      (await check(jit, "create-user", ["Other"])).facts?.refusal
    ).toMatchObject({ reason: "no_mapped_group", groups: ["Other"] });
    expect((await check(jit, "create-user", [])).result).toEqual({
      error: "not_registered",
    });
    expect(
      (await check(jit, "create-user", undefined)).facts?.refusal?.reason
    ).toBe("groups_claim_absent");

    await jit.context.db
      .update(group)
      .set({ archivedAt: new Date() })
      .where(eq(group.id, mappedId));
    expect((await check(jit, "create-user", ["Mapped"])).result).toEqual({
      error: "not_registered",
    });
  });

  it("a refused jit admission leaves zero user and account rows and one audit row", async () => {
    const scope = jit.context.authRequestScope;
    const email = `${randomUUID()}@example.invalid`;
    await scope.run(async () => {
      expect(
        await validateOAuthUser({
          tenant: jit.context,
          scope,
          data: {
            user: { email },
            source: {
              action: "create-user",
              oauth: { profile: { groups: ["Unmapped"] } },
            },
          },
        })
      ).toEqual({ error: "not_registered" });
      await flushRefusalAudit(jit.context, scope);
    });
    expect(
      await jit.context.db.select().from(user).where(eq(user.email, email))
    ).toHaveLength(0);
    expect(
      await jit.context.db
        .select()
        .from(account)
        .where(eq(account.accountId, email))
    ).toHaveLength(0);

    const rows = await jit.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "auth:sign_in_refused"));
    // SAFETY: this test selects only auth:sign_in_refused rows written by flushRefusalAudit.

    expect(
      rows.filter((row) => (row.metadata as { email?: string }).email === email)
    ).toHaveLength(1);
  });

  it("banned people are refused on both link-account and sign-in", async () => {
    const userId = await insertUser(jit.context, { banned: true });

    const results = await Promise.all([
      check(jit, "link-account", [], userId),
      check(jit, "sign-in", [], userId),
    ]);

    for (const result of results) {
      expect(result.result).toEqual({ error: "access_disabled" });
      expect(result.facts?.refusal?.reason).toBe("disabled");
    }
  });

  it("present names replace idp memberships, reuse pre-added groups, and leave local memberships", async () => {
    const userId = await insertUser(jit.context);
    const localId = await insertGroup(jit.context, [userId]);

    const preaddedId = await insertGroup(jit.context, [], {
      source: "idp",
      externalId: "Preadded",
      lastSeenAt: null,
    });

    await syncGroupMemberships(jit.context, userId, ["Preadded", "New", "New"]);

    const memberships = await jit.context.db
      .select({ id: groupMember.groupId, source: groupMember.source })
      .from(groupMember)
      .where(eq(groupMember.userId, userId));

    expect(memberships).toHaveLength(3);
    expect(memberships).toContainEqual({ id: preaddedId, source: "idp" });
    expect(memberships).toContainEqual({ id: localId, source: "local" });

    const [preadded] = await jit.context.db
      .select({ seen: group.lastSeenAt })
      .from(group)
      .where(eq(group.id, preaddedId));

    expect(preadded?.seen).toBeInstanceOf(Date);
  });

  it("present empty claim removes all idp memberships", async () => {
    const userId = await insertUser(jit.context);
    const localId = await insertGroup(jit.context, [userId]);
    await syncGroupMemberships(jit.context, userId, ["Removable"]);
    await syncGroupMemberships(jit.context, userId, []);
    expect(
      await jit.context.db
        .select()
        .from(groupMember)
        .where(
          and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
        )
    ).toHaveLength(0);
    expect(
      await jit.context.db
        .select()
        .from(groupMember)
        .where(
          and(eq(groupMember.userId, userId), eq(groupMember.groupId, localId))
        )
    ).toHaveLength(1);
  });

  it("absent claim preserves idp memberships and writes its audit row", async () => {
    const userId = await insertUser(jit.context);
    await syncGroupMemberships(jit.context, userId, ["Retained"]);
    await syncGroupMemberships(jit.context, userId, undefined);
    expect(
      await jit.context.db
        .select()
        .from(groupMember)
        .where(
          and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
        )
    ).toHaveLength(1);
    expect(
      await jit.context.db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.actorUserId, userId),
            eq(auditEvent.action, "auth:groups_claim_absent")
          )
        )
    ).toHaveLength(1);
  });

  it("activates a pending person and notifies only for a new normalized user agent", async () => {
    const userId = await insertUser(jit.context, {
      status: "pending",
      onboarding: "invited",
      firstSignInAt: null,
    });

    await recordOAuthSignIn(jit.context, {
      userId,
      userAgent: "Chrome/123 (Windows)",
    });

    const [person] = await jit.context.db
      .select()
      .from(user)
      .where(eq(user.id, userId));

    expect(person).toMatchObject({ status: "active", onboarding: "invited" });
    expect(person?.firstSignInAt).toBeInstanceOf(Date);
    expect(
      await jit.context.db
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
    ).toHaveLength(1);
    await recordOAuthSignIn(jit.context, {
      userId,
      userAgent: " chrome/123   (Windows) ",
    });
    expect(
      await jit.context.db
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
    ).toHaveLength(1);
    await recordOAuthSignIn(jit.context, {
      userId,
      userAgent: "Firefox/123 (Linux)",
    });
    expect(
      await jit.context.db
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
    ).toHaveLength(2);
  });
});
