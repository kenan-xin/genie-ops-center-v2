import { sessionCookieName } from "@genie/core";

import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * The browser activity call (R-15, R-15a): the one writer of `session.last_active_at`, made by
 * the SessionActivity client on real pointer, keyboard, or touch input, throttled to half the
 * idle window on its side. A live session answers the new absolute idle expiry; an
 * unauthenticated request answers 401 and expires the session cookie, so a browser whose
 * session the idle rule deleted lands on the sign-in page's session-expired state instead of
 * retrying forever against a cookie that names no row.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const result = await auth.recordActivity({ headers: request.headers });

  if (result === null) {
    const cookie = `${sessionCookieName(app.tenant.env.publicUrl)}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${app.tenant.env.publicUrl.startsWith("https://") ? "; Secure" : ""}`;

    return Response.json(
      { code: "session_expired" },
      {
        status: 401,
        headers: { "cache-control": "no-store", "set-cookie": cookie },
      }
    );
  }

  return Response.json(
    { idleExpiresAt: result.idleExpiresAt.toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}

export { handler as POST };
