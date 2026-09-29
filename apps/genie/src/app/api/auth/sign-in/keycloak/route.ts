import { NextResponse } from "next/server.js";

import {
  discoverySignInCause,
  KEYCLOAK_UNAVAILABLE,
  requireAuth,
} from "../../../../../auth.ts";
import { requireContext } from "../../../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * Starts the Keycloak sign-in and sends the browser to the realm (R-5, R-6). It is a plain link
 * target so the sign-in page needs no client JavaScript, and it is the server side of
 * `signIn.social({ provider: "keycloak" })` with `errorCallbackURL` pointing back at the sign-in
 * page (R-17a) and `callbackURL` at the landing decision (R-36).
 *
 * R-54d: while the realm's discovery document does not answer, the browser lands on the sign-in
 * page with the named `keycloak_unavailable` cause rather than at a broken provider.
 */
export async function GET(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const publicUrl = app.tenant.env.publicUrl;

  const signInPage = new URL("/sign-in", publicUrl);

  const unavailable = (cause: string = KEYCLOAK_UNAVAILABLE) => {
    signInPage.searchParams.set("error", cause);

    return NextResponse.redirect(signInPage);
  };

  const discovery = await auth.ensureDiscovery();

  if (!discovery.ready)
    return unavailable(discoverySignInCause(discovery.cause));

  // The origin check reads the Origin header, which a top-level navigation does not carry, so the
  // configured public origin is supplied and a request header can never steer it (R-70).
  const headers = new Headers(request.headers);

  if (!headers.has("origin")) headers.set("origin", publicUrl);

  const started = await auth.beginKeycloakSignIn({
    headers,
    callbackURL: new URL("/auth/complete", publicUrl).toString(),
    errorCallbackURL: signInPage.toString(),
  });

  if (started.url === undefined) return unavailable();

  const redirect = NextResponse.redirect(started.url);

  // Better Auth's short-lived OAuth state/PKCE cookie must reach the browser, or the callback
  // cannot verify the state it issued.
  for (const cookie of started.headers.getSetCookie()) {
    redirect.headers.append("set-cookie", cookie);
  }

  return redirect;
}
