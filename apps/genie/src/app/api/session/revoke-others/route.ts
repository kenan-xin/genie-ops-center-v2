import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * Sign out everywhere from the account page's Sessions block (R-18): every session except the
 * caller's own is deleted, and the answer carries the count the block confirms with.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

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
