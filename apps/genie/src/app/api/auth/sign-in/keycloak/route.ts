import { NextResponse } from "next/server.js";

import { KEYCLOAK_UNAVAILABLE, requireAuth } from "../../../../../auth.ts";
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

  const unavailable = () => {
    signInPage.searchParams.set("error", KEYCLOAK_UNAVAILABLE);

    return NextResponse.redirect(signInPage);
  };

  const discovery = await auth.ensureDiscovery();

  if (!discovery.ready) return unavailable();

  // The origin check reads the Origin header, which a top-level navigation does not carry, so the
  // configured public origin is supplied and a request header can never steer it (R-70).
  const headers = new Headers(request.headers);

  if (!headers.has("origin")) headers.set("origin", publicUrl);

  const { url } = await auth.beginKeycloakSignIn({
    headers,
    callbackURL: new URL("/auth/complete", publicUrl).toString(),
    errorCallbackURL: signInPage.toString(),
  });

  return url === undefined ? unavailable() : NextResponse.redirect(url);
}
