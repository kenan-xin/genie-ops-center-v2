import { landingRoute, permittedNavigation, principalFor } from "@genie/core";
import { NextResponse } from "next/server.js";

import { requireAuth } from "../../../auth.ts";
import { requireContext } from "../../../context.ts";
import { modules } from "../../../registry.ts";

export const dynamic = "force-dynamic";

/**
 * R-36: after the realm authenticates a person, the browser returns here and this route sends them
 * to the landing entry when it survived the permission filter, or to the home shell (which shows
 * the no-grants empty state) when it did not. The OAuth callback URL is the realm-registered
 * `/api/auth/callback/keycloak`; this is the `callbackURL` the sign-in call passes, so the person
 * passes through the callback and then through this landing decision.
 */
export async function GET(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const session = await auth.getSession({ headers: request.headers });

  if (session === null) {
    return NextResponse.redirect(
      new URL("/sign-in?error=session_missing", app.tenant.env.publicUrl)
    );
  }

  const permitted = await permittedNavigation({
    entitlements: app.tenant.entitlements,
    modules,
    // The session was read once above and was not null; its user id is the principal (R-27).
    caller: principalFor({
      tenant: app.tenant,
      modules,
      userId: session.user.id,
      authenticated: true,
    }),
  });

  const landing = landingRoute(permitted) ?? "/";

  return NextResponse.redirect(new URL(landing, app.tenant.env.publicUrl));
}
