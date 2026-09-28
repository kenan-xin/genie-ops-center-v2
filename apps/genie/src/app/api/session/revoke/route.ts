import { z } from "zod";

import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../../request-origin.ts";

export const dynamic = "force-dynamic";

/** The one field the revoke request carries, parsed at the boundary. */
const revokeRequest = z.object({ sessionId: z.string().min(1) });

/**
 * Per-session sign-out from the account page's Sessions block (R-18). The current session is
 * refused by the member (`current`), a row that is not the caller's own answers `not-found`,
 * and both read as a plain 404 so the block reveals nothing about other people's rows.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  if (!stateChangeOriginAllowed(request, app.tenant.env.publicUrl))
    return crossOriginRefusal();

  const body: unknown = await request.json().catch(() => undefined);

  const parsed = revokeRequest.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { code: "invalid-input", message: "The request names no session." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const result = await auth.revokeOwnSession({
    headers: request.headers,
    sessionId: parsed.data.sessionId,
  });

  if (result === "revoked") {
    return Response.json(
      { revoked: true },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // `unauthenticated` is a 401; the caller whose own row it is (`current`) and a row that is
  // not the caller's (`not-found`) both read as absent.
  const status = result === "unauthenticated" ? 401 : 404;

  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export { handler as POST };
