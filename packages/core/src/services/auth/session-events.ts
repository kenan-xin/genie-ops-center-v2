import { and, eq, sql } from "drizzle-orm";
/* oxlint-disable anti-slop/require-readable-spacing -- consecutive sign-in writes form one ordered hook. */

import { coreSessionNew } from "../../../contracts/identity.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { auditEvent, notification, user } from "../../schema.ts";
import { writeAuthAuditEvent } from "../audit/index.ts";
import { describeUserAgent } from "./user-agent.ts";

/** The stored comparison key ignores incidental case and whitespace in a browser's header. */
export function normalizeUserAgent(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Register the core subscriber once on this tenant's event bus. */
export function registerSessionNewHandler(tenant: TenantContext): void {
  tenant.events.on(coreSessionNew, async ({ payload }, context) => {
    await context.db.insert(notification).values({
      userId: payload.userId,
      kind: "new-device-sign-in",
      title: "New device sign-in",
      body: `Your account signed in from ${payload.deviceName}.`,
      link: "/account",
    });

    if (context.mailer.provider === "none") return;

    const branding = await context.branding.get();
    await context.mailer.send({
      templateId: "new-device-sign-in",
      to: payload.email,
      variables: {
        name: payload.name,
        companyName: branding.companyName,
        productName: "Genie Ops Center",
        deviceName: payload.deviceName,
        supportEmail: branding.supportEmail ?? "your administrator",
        link: context.publicUrl("/account"),
      },
    });
  });
}

/** Called only by the OAuth-filled session hook, after Better Auth committed its session. */
export async function recordOAuthSignIn(
  tenant: TenantContext,
  session: {
    readonly userId: string;
    readonly userAgent?: string | null | undefined;
  }
): Promise<void> {
  const [person] = await tenant.db
    .select({
      email: user.email,
      name: user.name,
      status: user.status,
      firstSignInAt: user.firstSignInAt,
    })
    .from(user)
    .where(eq(user.id, session.userId))
    .limit(1);

  if (person === undefined) throw new Error("the OAuth session has no person");

  const now = new Date();
  await tenant.db
    .update(user)
    .set({
      status: person.status === "pending" ? "active" : person.status,
      firstSignInAt: person.firstSignInAt ?? now,
      lastSignInAt: now,
    })
    .where(eq(user.id, session.userId));

  const agent = normalizeUserAgent(session.userAgent ?? null);
  const [seen] = await tenant.db
    .select({ id: auditEvent.id })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.actorUserId, session.userId),
        eq(auditEvent.action, "auth:sign_in"),
        sql`${auditEvent.metadata}->>'userAgent' = ${agent}`
      )
    )
    .limit(1);

  await writeAuthAuditEvent(tenant, {
    action: "auth:sign_in",
    actorUserId: session.userId,
    targetUserId: session.userId,
    summary: "Signed in",
    metadata: { userAgent: agent },
  });

  if (seen !== undefined) return;

  const description = describeUserAgent(session.userAgent ?? null);
  await withTransaction(tenant, async (tx) => {
    await tenant.events.emit(tx, coreSessionNew, {
      userId: session.userId,
      email: person.email,
      name: person.name,
      deviceName: `${description.device}, ${description.browser}`,
    });
  });
}
