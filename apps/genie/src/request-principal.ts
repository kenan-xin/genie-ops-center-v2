import {
  principalFor,
  type AuthSession,
  type RequestPrincipal,
  type TenantContext,
} from "@genie/core";

import { requireAuth } from "./auth.ts";
import { modules } from "./registry.ts";

/**
 * The one principal of one request, for the tRPC context (R-27, DEC-48). Server components read
 * `documentPrincipal`, which shares the request's one enforced read with the root layout. Each
 * call builds a fresh lazy loader, so nothing is shared between requests and a revoked role
 * applies on the next one.
 *
 * The signed-in person's id comes from this request's Better Auth session (S2-04), which enforces
 * the idle rule (R-14): an idle-expired or capped session returns null, so the principal is
 * anonymous and `authenticated` is false - that is what a protected procedure refuses at 401, and
 * what makes `can()` and `scopesFor()` refuse without reading a row. Both fields come from this
 * one read, so no user id can imply a session.
 */
export async function requestPrincipal(
  tenant: TenantContext,
  headers: Headers
): Promise<RequestPrincipal> {
  return principalForSession(
    tenant,
    await requireAuth(tenant).getSession({ headers })
  );
}

/** The principal of one enforced read's session; null is the anonymous principal. */
export function principalForSession(
  tenant: TenantContext,
  session: AuthSession | null
): RequestPrincipal {
  return principalFor({
    tenant,
    modules,
    userId: session?.user.id,
    authenticated: session !== null,
  });
}
