import type { AuthMember, TenantContext } from "@genie/core";

/**
 * The context's auth member, or a failure. The application profile requires the authentication
 * values, so the bootstrap always builds the member; a caller that reaches this without one is a
 * wiring defect, not a missing configuration, and fails loudly rather than answering anonymously.
 */
export function requireAuth(tenant: TenantContext): AuthMember {
  if (tenant.auth === undefined) {
    throw new Error(
      "The tenant context has no auth member. The application profile must build one."
    );
  }

  return tenant.auth;
}

/** The sign-in page a refusal or a signed-out browser lands on (R-17a). */
export const SIGN_IN_PATH = "/sign-in";

/** The path the identity provider returns the browser to, which then lands the person (R-36). */
export const AUTH_COMPLETE_PATH = "/auth/complete";

/**
 * The named cause the sign-in endpoint refuses with while the realm's discovery document does not
 * answer (R-54d). It is stable so the sign-in page maps it to a banner and a test can assert it.
 */
export const KEYCLOAK_UNAVAILABLE = "keycloak_unavailable";

/**
 * Where sign-out sends the browser (R-17). In managed mode the realm's end-session URL ends the
 * realm session too, and when there is none the browser still lands on `PUBLIC_URL`. In
 * client-only mode the realm session is the company's and serves its other applications, so only
 * the Genie Ops Center session ends and the browser goes to `PUBLIC_URL`.
 */
export function signOutDestination(input: {
  readonly realmMode: "managed" | "customer";
  readonly providerLogoutUrl: string | undefined;
  readonly publicUrl: string;
}): string {
  if (input.realmMode === "managed" && input.providerLogoutUrl !== undefined) {
    return input.providerLogoutUrl;
  }

  return input.publicUrl;
}
