import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { requireAuth, SIGN_IN_PATH } from "../../../auth.ts";
import { requireContext } from "../../../context.ts";
import { AdminAccountRoute } from "./admin-account-route.tsx";

export const dynamic = "force-dynamic";

const EXPIRED_PATH = `${SIGN_IN_PATH}?error=session_expired`;

/**
 * The break-glass account page at `/admin/account` (R-66): change password with the current one,
 * re-enroll the authenticator, and sessions. No Preferences and no Roles and access. A limited
 * session is sent back to the door, where the next unmet step is shown; anyone who is not the
 * break-glass account goes to their own account page.
 */
export default async function AdminAccountPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const requestHeaders = await headers();

  const state = await auth.sessionState({ headers: requestHeaders });

  if (state.status === "idle-expired") redirect(EXPIRED_PATH);

  if (state.status === "anonymous") redirect(SIGN_IN_PATH);

  const person = state.session.user;

  if (!person.isBreakGlass) redirect("/account");

  if (person.mustChangePassword || !person.twoFactorEnabled)
    redirect("/admin/login");

  const [sessions, branding] = await Promise.all([
    auth.listOwnSessions({ headers: requestHeaders }),
    app.tenant.branding.get(),
  ]);

  return (
    <AdminAccountRoute
      name={person.name}
      email={person.email}
      productName={branding.productName}
      // The two-factor table carries no enrollment timestamp; the field shows the unknown copy.
      authenticatorEnrolledAt={null}
      sessions={(sessions ?? []).map((session) => ({
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
