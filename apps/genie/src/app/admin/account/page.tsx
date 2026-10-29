import { redirect } from "next/navigation.js";

import { requireAuth } from "../../../auth.ts";
import { requireContext } from "../../../context.ts";
import { requireSession } from "../../../document-session.ts";
import { AdminAccountRoute } from "./admin-account-route.tsx";

export const dynamic = "force-dynamic";

/**
 * The break-glass account page at `/admin/account` (R-66): change password with the current one,
 * re-enroll the authenticator, and sessions. No Preferences and no Roles and access.
 * `requireSession()` sends a limited session back to the door, where the next unmet step is shown
 * (ARCH-1). Anyone who is not the break-glass account goes to their own account page.
 */
export default async function AdminAccountPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const signedIn = await requireSession();

  const person = signedIn.user;

  if (!person.isBreakGlass) redirect("/account");

  const [sessions, branding] = await Promise.all([
    auth.listOwnSessions({ session: signedIn }),
    app.tenant.branding.get(),
  ]);

  return (
    <AdminAccountRoute
      name={person.name}
      email={person.email}
      productName={branding.productName}
      // The two-factor table carries no enrollment timestamp; the field shows the unknown copy.
      authenticatorEnrolledAt={null}
      sessions={sessions.map((session) => ({
        id: session.id,
        device: session.device,
        browser: session.browser,
        ipAddress: session.ipAddress,
        signedInAt: session.signedInAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        isCurrent: session.isCurrent,
      }))}
      timeZone={branding.defaultTimeZone}
      passwordNotice={null}
    />
  );
}
