import {
  principalFor,
  type RequestPrincipal,
  type TenantContext,
} from "@genie/core";

import { modules } from "./registry.ts";

/**
 * The one principal of one request, for the tRPC context and the page loader (R-27, DEC-48). Each
 * call builds a fresh lazy loader, so nothing is shared between requests and a revoked role
 * applies on the next one.
 *
 * Sign-in arrives with S2-04, which resolves the signed-in person's id from the session here.
 * Until then every request is anonymous, and the real evaluator refuses an anonymous caller
 * everything without reading a row.
 */
export function requestPrincipal(tenant: TenantContext): RequestPrincipal {
  return principalFor({ tenant, modules, userId: undefined });
}
