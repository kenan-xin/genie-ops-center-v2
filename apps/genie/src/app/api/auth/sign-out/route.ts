import { sessionCookieName } from "@genie/core";
import { NextResponse } from "next/server.js";

import { requireAuth, signOutDestination } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../../request-origin.ts";

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
 *
 * The idle sign-out (`?idle=1`, R-15a) is the post the browser makes when its idle count ends. It
 * ends a live session the same way, but lands on the expired banner instead of the realm, also
 * while the server window is still open. A browser whose session another tab already ended lands
 * on the same banner.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const publicUrl = app.tenant.env.publicUrl;

  if (!stateChangeOriginAllowed(request, publicUrl))
    return crossOriginRefusal();

  const idle = new URL(request.url).searchParams.get("idle") === "1";
  const state = await auth.sessionState({ headers: request.headers });

  if (state.status === "idle-expired") {
    // R-17: sign-out removes the session row; an idle one goes with the cookie cleared below.
    await auth.endIdleSession({ headers: request.headers });

    return expiredBanner(publicUrl);
  }

  if (idle && state.status === "anonymous") return expiredBanner(publicUrl);

  const result = await auth.signOut({
    headers: request.headers,
    callbackURL: publicUrl,
  });

  if (idle) return expiredBanner(publicUrl, result.headers.getSetCookie());

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

/**
 * The expired banner (R-17a). It carries Better Auth's own clearing cookies when the sign-out
 * ended a live session, and otherwise clears the session cookie itself.
 */
function expiredBanner(
  publicUrl: string,
  cookies?: readonly string[]
): Response {
  const expired = NextResponse.redirect(
    new URL("/sign-in?error=session_expired", publicUrl),
    303
  );

  if (cookies === undefined) {
    expired.cookies.set(sessionCookieName(publicUrl), "", {
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: publicUrl.startsWith("https://"),
      path: "/",
    });
  } else {
    for (const cookie of cookies) expired.headers.append("set-cookie", cookie);
  }

  expired.headers.set("cache-control", "no-store");

  return expired;
}

export { handler as POST };
