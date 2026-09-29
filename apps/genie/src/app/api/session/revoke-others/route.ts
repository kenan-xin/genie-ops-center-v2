import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import { refuseLimitedSession } from "../../../../limited-session.ts";
import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../../request-origin.ts";

export const dynamic = "force-dynamic";

/**
 * Sign out everywhere from the account page's Sessions block (R-18): every session except the
 * caller's own is deleted, and the answer carries the count the block confirms with.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  if (!stateChangeOriginAllowed(request, app.tenant.env.publicUrl))
    return crossOriginRefusal();

  // R-30: a limited break-glass session may not act on its own sessions.
  const limited = await refuseLimitedSession(auth, request.headers);

  if (limited !== null) return limited;

  const revoked = await auth.revokeOtherOwnSessions({
    headers: request.headers,
  });

  if (revoked === null) {
    return new Response(null, {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }

  return Response.json(
    { revoked },
    { headers: { "cache-control": "no-store" } }
  );
}

export { handler as POST };
