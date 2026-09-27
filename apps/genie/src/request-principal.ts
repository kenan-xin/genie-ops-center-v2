import {
  principalFor,
  type RequestPrincipal,
  type TenantContext,
} from "@genie/core";

import { requireAuth } from "./auth.ts";
import { modules } from "./registry.ts";

/**
 * The one principal of one request, for the tRPC context and the page loader (R-27, DEC-48). Each
 * call builds a fresh lazy loader, so nothing is shared between requests and a revoked role
 * applies on the next one.
 *
 * The signed-in person's id comes from this request's Better Auth session (S2-04). A request with
 * no session is anonymous, and the real evaluator refuses an anonymous caller everything without
 * reading a row.
 */
export async function requestPrincipal(
  tenant: TenantContext,
  headers: Headers
): Promise<RequestPrincipal> {
  const session = await requireAuth(tenant).getSession({ headers });

  return principalFor({
    tenant,
    modules,
    userId: session?.user.id,
  });
}
