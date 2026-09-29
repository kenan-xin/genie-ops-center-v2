import { breakGlassSteps, type BreakGlassStep } from "@genie/core";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { requireAuth } from "../../../auth.ts";
import { requireContext } from "../../../context.ts";
import { AdminLoginRoute } from "./admin-login-route.tsx";

export const dynamic = "force-dynamic";

/** The default door for a visitor with no session: credentials, then the code (design B9). */
const ANONYMOUS_STEPS: readonly BreakGlassStep[] = [
  "credentials",
  "authenticator-code",
];

/**
 * The hidden break-glass door at `/admin/login` (R-62 to R-65). It is not linked from the sign-in
 * page. The server reads this request's enforced session and decides the card: credentials for a
 * visitor, the forced password change or the enrollment for a limited break-glass session, and a
 * redirect away for an unlimited one or for anyone who is not the break-glass account.
 */
export default async function AdminLoginPage() {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const requestHeaders = await headers();

  const state = await auth.sessionState({ headers: requestHeaders });

  if (state.status === "idle-expired")
    redirect("/sign-in?error=session_expired");

  let step: BreakGlassStep = "credentials";
  let steps: readonly BreakGlassStep[] = ANONYMOUS_STEPS;
  let email = "";

  if (state.status === "authenticated") {
    const person = state.session.user;

    if (!person.isBreakGlass) redirect("/");

    // A completed account has nothing to do at the door.
    if (!person.mustChangePassword && person.twoFactorEnabled)
      redirect("/admin/account");

    email = person.email;
    steps = breakGlassSteps({
      mustChangePassword: person.mustChangePassword,
      mustEnrollAuthenticator: !person.twoFactorEnabled,
    });
    step = person.mustChangePassword
      ? "change-password"
      : "authenticator-enroll";
  }

  const branding = await app.tenant.branding.get();

  return (
    <AdminLoginRoute
      productName={branding.productName}
      initialStep={step}
      initialSteps={steps}
      email={email}
    />
  );
}
