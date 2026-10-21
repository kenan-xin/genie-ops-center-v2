import { sessionCookieName } from "@genie/core";
import { NextResponse } from "next/server.js";

import { requireAuth, SIGN_IN_PATH } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * Clears the cookie of a session the idle rule refused, then shows the expired banner (R-14,
 * R-17a). The layout and the account pages send an idle browser here. A visitor whose cookie
 * names no session at all - none sent, revoked, or past the 24 hour cap - is cleared too but
 * lands on the plain sign-in page, because no idle window ended for them.
 *
 * The route reads the session first and clears only a cookie that names no live session. A
 * `SameSite=Lax` cookie travels on a top-level link from another site, so a route that always
 * cleared it would let any site sign a browser out (genie-ops-center-v2-1rr0). A live session is
 * sent home with its cookie untouched. Fetch Metadata is not checked: a person who follows an
 * outside link to a page while idle arrives here through that page's redirect, which the browser
 * marks `cross-site`, and that person must still land on the banner.
 */
export async function GET(request: Request): Promise<Response> {
  const { tenant } = requireContext();
  const publicUrl = tenant.env.publicUrl;
  const auth = requireAuth(tenant);

  const state = await auth.sessionState({ headers: request.headers });

  if (state.status === "authenticated") {
    const home = NextResponse.redirect(new URL("/", publicUrl), 303);

    home.headers.set("cache-control", "no-store");

    return home;
  }

  // The row ends with the cookie: this response clears it, so the browser stops sending it.
  if (state.status === "idle-expired")
    await auth.endIdleSession({ headers: request.headers });

  const response = NextResponse.redirect(
    new URL(
      state.status === "idle-expired"
        ? "/sign-in?error=session_expired"
        : SIGN_IN_PATH,
      publicUrl
    ),
    303
  );

  response.cookies.set(sessionCookieName(publicUrl), "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.startsWith("https://"),
    path: "/",
  });
  response.headers.set("cache-control", "no-store");

  return response;
}
