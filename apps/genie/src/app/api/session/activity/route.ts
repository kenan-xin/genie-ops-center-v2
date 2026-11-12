import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../../request-origin.ts";
import { expiredAnswer } from "../expired-answer.ts";

export const dynamic = "force-dynamic";

/**
 * The browser activity call (R-15, R-15a): the one writer of `session.last_active_at`, made by
 * the SessionActivity client on real pointer, keyboard, or touch input, throttled to half the
 * idle window, at most 150 seconds, on its side. A live session answers 200 with the tenant's
 * current idle window, read through the settings reader, so the open tabs follow a changed
 * window (`6wz1.92`). An unauthenticated request answers 401 and expires the session cookie, so
 * a browser whose session the idle rule refused lands on the sign-in page's session-expired
 * state instead of retrying forever against a cookie that names no live session.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  if (!stateChangeOriginAllowed(request, app.tenant.env.publicUrl))
    return crossOriginRefusal();

  const slid = await auth.recordActivity({ headers: request.headers });

  if (!slid)
    return expiredAnswer({
      auth,
      headers: request.headers,
      publicUrl: app.tenant.env.publicUrl,
    });

  const { sessionIdleMinutes } = await app.tenant.settings.get();

  return Response.json(
    { idleMinutes: sessionIdleMinutes },
    { headers: { "cache-control": "no-store" } }
  );
}

export { handler as POST };
