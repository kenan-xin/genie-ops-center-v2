import { breakGlassSteps, type BreakGlassStep } from "@genie/core";
import { redirect } from "next/navigation.js";

import { requireContext } from "../../../context.ts";
import { documentSessionState } from "../../../document-session.ts";
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
 * redirect away for an unlimited one or for anyone who is not the break-glass account. It reads
 * the session itself and never calls `requireSession()`, which sends a limited session here. An
 * idle session sees the credentials card like a visitor, and its row goes at the next sign-in
 * (R-14, ARCH-1).
 */
export default async function AdminLoginPage() {
  const app = requireContext();

  const state = await documentSessionState();

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
      // The default mark, as on the sign-in page: the mark link answers only a signed-in person.
      identity={{
        companyName: branding.companyName,
        productName: branding.productName,
        logoLightUrl: null,
        logoDarkUrl: null,
        markUrl: null,
      }}
      initialStep={step}
      initialSteps={steps}
      email={email}
    />
  );
}
