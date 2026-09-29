import {
  principalFor,
  type AuthSession,
  type AuthSessionState,
  type RequestPrincipal,
  type TenantContext,
} from "@genie/core";

import { requireAuth } from "./auth.ts";
import { modules } from "./registry.ts";

/**
 * The one enforced session read of one request (R-14, S2-07). The tRPC context and the page
 * loader read it once and build the principal from its answer, so an idle-expired or capped
 * session is recognised as unauthenticated rather than as a person holding no grants.
 */
export async function requestSession(
  tenant: TenantContext,
  headers: Headers
): Promise<AuthSessionState> {
  return requireAuth(tenant).sessionState({ headers });
}

/**
 * The one principal of one request, for the tRPC context and the page loader (R-27, DEC-48). Each
 * call builds a fresh lazy loader, so nothing is shared between requests and a revoked role
 * applies on the next one.
 *
 * The signed-in person's id comes from this request's session (S2-04). A request with no live
 * session - anonymous, idle-expired or past its absolute cap - passes no id, and the real
 * evaluator refuses it everything without reading a row.
 */
export function principalForSession(
  tenant: TenantContext,
  session: AuthSession | undefined
): RequestPrincipal {
  return principalFor({
    tenant,
    modules,
    userId: session?.user.id,
  });
}

export async function requestPrincipal(
  tenant: TenantContext,
  headers: Headers
): Promise<RequestPrincipal> {
  const state = await requestSession(tenant, headers);

  return principalForSession(
    tenant,
    state.status === "authenticated" ? state.session : undefined
  );
}
