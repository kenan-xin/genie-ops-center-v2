import {
  coreRoleGranted,
  coreRoleRevoked,
} from "../../../contracts/identity.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { notification } from "../../schema.ts";

/**
 * R-47: the two role events write an in-app notification and send the role email. They are
 * emitted by the one role-assignment service, so a grant or a revocation reaches the person
 * whether it was made on the Access screen, in Add person, or on a group.
 *
 * The notification is written first and always; the email is best-effort and is skipped when the
 * deployment has no mailer configured (`provider === "none"`), exactly like the new-device event.
 */
function register(
  tenant: TenantContext,
  event: typeof coreRoleGranted | typeof coreRoleRevoked,
  content: {
    readonly kind: string;
    readonly title: (roleName: string) => string;
    readonly body: (roleName: string) => string;
    readonly templateId: "role-granted" | "role-removed";
  }
): void {
  tenant.events.on(event, async ({ payload }, context) => {
    await context.db.insert(notification).values({
      userId: payload.userId,
      kind: content.kind,
      title: content.title(payload.roleName),
      body: content.body(payload.roleName),
      link: "/account",
    });

    if (context.mailer.provider === "none") return;

    const branding = await context.branding.get();

    await context.mailer.send({
      templateId: content.templateId,
      to: payload.email,
      variables: {
        name: payload.name,
        companyName: branding.companyName,
        productName: "Genie Ops Center",
        roleName: payload.roleName,
        supportEmail: branding.supportEmail ?? "your administrator",
        link: context.publicUrl("/account"),
      },
    });
  });
}

/** Registers both role-event handlers once on this tenant's event bus. */
export function registerRoleEventHandlers(tenant: TenantContext): void {
  register(tenant, coreRoleGranted, {
    kind: "role-granted",
    title: (roleName) => `You were granted the ${roleName} role`,
    body: (roleName) => `You now have the ${roleName} role.`,
    templateId: "role-granted",
  });

  register(tenant, coreRoleRevoked, {
    kind: "role-removed",
    title: (roleName) => `Your ${roleName} role was removed`,
    body: (roleName) => `The ${roleName} role was removed from your account.`,
    templateId: "role-removed",
  });
}
