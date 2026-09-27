import { KEYCLOAK_UNAVAILABLE, requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/** The one refusal the sign-in endpoint answers while the realm's discovery does not (R-54d). */
function realmUnavailable(): Response {
  return Response.json(
    {
      code: KEYCLOAK_UNAVAILABLE,
      message:
        "The identity provider is unavailable. Try again shortly, or use the break-glass sign-in.",
    },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

/**
 * The one catch-all route under `/api/auth/` (D2-5). It hands every authentication request to the
 * tenant context's Better Auth instance, which is the only place a session, a callback or a
 * break-glass credential is handled.
 *
 * R-54d: the realm's discovery document is read before a social sign-in, and while it does not
 * answer the request is refused with the named `keycloak_unavailable` cause. Break-glass email and
 * password (`/sign-in/email`) is not a social sign-in, so it still works while the realm is down.
 */
async function handler(
  request: Request,
  context: { readonly params: Promise<{ readonly all: string[] }> }
): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  const { all } = await context.params;
  const path = `/${all.join("/")}`;

  if (request.method === "POST" && path === "/sign-in/social") {
    const discovery = await auth.ensureDiscovery();

    if (!discovery.ready) return realmUnavailable();
  }

  return auth.handler(request);
}

export { handler as GET, handler as POST };
