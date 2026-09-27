import { NextResponse } from "next/server.js";

import { requireAuth, signOutDestination } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * The controlled sign-out of R-17. Better Auth's own `/sign-out` deletes the session row and
 * clears the cookie; this route decides where the browser goes next, because the rule depends on
 * the realm mode:
 *
 * - managed: the realm's `end_session_endpoint` with the stored id token as `id_token_hint` and
 *   `PUBLIC_URL` as `post_logout_redirect_uri`, falling back to `client_id` when no id token was
 *   stored (Better Auth builds that URL).
 * - customer (client-only): the Genie Ops Center session row only; the realm session is the
 *   company's and serves its other applications, so no end-session redirect happens.
 *
 * `disableRedirect` keeps Better Auth from answering its own redirect, so the response is one
 * redirect this route builds and the `Set-Cookie` that clears the session cookie is copied across.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const publicUrl = app.tenant.env.publicUrl;

  const result = await auth.signOut({
    headers: request.headers,
    callbackURL: publicUrl,
  });

  const { realmMode } = await app.tenant.settings.get();

  const target = signOutDestination({
    realmMode: realmMode === "customer" ? "customer" : "managed",
    providerLogoutUrl: result.providerLogoutUrl,
    publicUrl,
  });

  const response = NextResponse.redirect(target, 303);

  for (const cookie of result.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }

  response.headers.set("cache-control", "no-store");

  return response;
}

export { handler as POST };
