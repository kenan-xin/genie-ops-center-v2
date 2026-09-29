import { flushRefusalAudit, sessionCookieName } from "@genie/core";

import {
  authPath,
  authRouteAllowed,
  discoverySignInCause,
  KEYCLOAK_ISSUER_MISMATCH,
  readAuthRequestBody,
  requireAuth,
} from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import { newRequestId } from "../../../../request-id.ts";

export const dynamic = "force-dynamic";

/** The message each realm-unavailable cause answers with (R-54d). */
function realmUnavailableMessage(cause: string): string {
  return cause === KEYCLOAK_ISSUER_MISMATCH
    ? "The identity provider is not the one this deployment was set up with. Contact your administrator."
    : "The identity provider is unavailable. Try again shortly, or use the break-glass sign-in.";
}

/** The one refusal the sign-in endpoints answer while the realm's discovery is unusable (R-54d). */
function realmUnavailable(cause: string): Response {
  return Response.json(
    { code: cause, message: realmUnavailableMessage(cause) },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

/** The answer for every Better Auth path the allowlist does not serve. */
function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * The one catch-all route under `/api/auth/` (D2-5). It hands an allowed authentication request
 * to the tenant context's Better Auth instance, which is the only place a session, a callback or a
 * break-glass credential is handled. Only the paths `authRouteAllowed` lists reach Better Auth;
 * every other path answers 404 (R-6, R-7). A later ticket that needs another Better Auth endpoint
 * adds it to that list in `auth.ts`, with a test, in its own change.
 *
 * R-54d: the realm's discovery document is read before a social sign-in, and while it does not
 * answer the request is refused with the named `keycloak_unavailable` cause. Break-glass email and
 * password (`/sign-in/email`) is not a social sign-in, so it still works while the realm is down.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);

  // The raw path Better Auth routes on, not the segments Next decoded (see `authPath`).
  const path = authPath(request.url);

  if (
    !authRouteAllowed({
      method: request.method,
      path,
      body: await readAuthRequestBody(request),
    })
  ) {
    return notFound();
  }

  // R-14: Better Auth's own read answers only the 24 hour cap, so an allowed endpoint that
  // carries a session cookie runs the enforced read first. An idle-dead row is deleted here,
  // and Better Auth then answers unauthenticated for the same request.
  const cookieName = sessionCookieName(app.tenant.env.publicUrl);

  if ((request.headers.get("cookie") ?? "").includes(`${cookieName}=`)) {
    await auth.sessionState({ headers: request.headers });
  }

  if (request.method === "POST" && path === "/sign-in/social") {
    const discovery = await auth.ensureDiscovery();

    if (!discovery.ready)
      return realmUnavailable(discoverySignInCause(discovery.cause));
  }

  // The proxy forwards one x-request-id on every request, so the sign-in path reuses that id
  // instead of minting a second one; the session-new event an OAuth sign-in emits then inherits
  // it, and its follow-up handler and lines carry the same id.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();

  return app.tenant.correlationScope.run(requestId, () =>
    app.tenant.authRequestScope.run(async () => {
      try {
        return await auth.handler(request);
      } finally {
        await flushRefusalAudit(app.tenant, app.tenant.authRequestScope);
      }
    })
  );
}

export { handler as GET, handler as POST };
