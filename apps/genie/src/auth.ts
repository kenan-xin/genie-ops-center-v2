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
 * The Better Auth endpoints the `/api/auth/` catch-all serves, by path and method. Every other
 * path answers 404, so an endpoint Better Auth adds or enables is closed until a ticket opens it
 * here (B1, B2 of the S2-04 review): `/get-access-token`, `/refresh-token` and `/account-info`
 * would hand stored realm tokens back (R-7), and `/link-social` or `/unlink-account` would change
 * which identity reaches an account. A later ticket that needs another endpoint adds it to this
 * list in its own change, with a test.
 *
 * `/sign-out` is absent on purpose: the app's own `/api/auth/sign-out` route shadows it (R-17).
 */
const AUTH_ROUTES = new Map([
  ["/callback/keycloak", ["GET", "POST"]],
  ["/sign-in/social", ["POST"]],
  ["/sign-in/email", ["POST"]],
  ["/get-session", ["GET"]],
]);

/** What the allowlist reads from a request body: a JSON object or not, and an `idToken` field. */
export type AuthRequestBody =
  | { readonly kind: "object"; readonly carriesIdToken: boolean }
  | { readonly kind: "other" };

/** Reads a POST body from a clone, so Better Auth still reads the original. */
export async function readAuthRequestBody(
  request: Request
): Promise<AuthRequestBody> {
  if (request.method !== "POST") return { kind: "other" };

  const value: unknown = await request
    .clone()
    .json()
    .catch(() => undefined);

  if (
    value === null ||
    value === undefined ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return { kind: "other" };
  }

  // SAFETY: the checks above leave a plain JSON object, whose own keys are what is read here.
  return {
    kind: "object",
    carriesIdToken: Object.hasOwn(value as object, "idToken"),
  };
}

/**
 * True when the catch-all may hand the request to Better Auth. `/sign-in/social` is served only
 * without an `idToken` field, because an id token sign-in is a second path with no PKCE, no state
 * and no nonce (R-6: "no second sign-in path for employees exists").
 */
export function authRouteAllowed(input: {
  readonly method: string;
  readonly path: string;
  readonly body: AuthRequestBody;
}): boolean {
  if (AUTH_ROUTES.get(input.path)?.includes(input.method) !== true)
    return false;

  if (input.path !== "/sign-in/social") return true;

  return input.body.kind === "object" && !input.body.carriesIdToken;
}

/** The five causes of the sign-in page states (R-17a), plus the realm-unavailable one (R-54d). */
export type SignInCause =
  | "keycloak_unavailable"
  | "not_registered"
  | "access_disabled"
  | "session_expired"
  | "session_missing";

/**
 * The sign-in page state for one `?error=` value. The page's own causes map to themselves, and
 * each Better Auth callback refusal maps to the state a person can act on: a refused link or
 * sign-up reads as not registered, and a broken flow (a lost state, a bad code) reads as "sign in
 * to continue". An unknown value shows the default state, and nothing is reflected.
 */
export function signInCause(
  error: string | undefined
): SignInCause | undefined {
  switch (error) {
    case "keycloak_unavailable":
    case "not_registered":
    case "access_disabled":
    case "session_expired":
    case "session_missing":
      return error;
    case "signup_disabled":
    case "account_not_linked":
    case "unable_to_link_account":
    case "email_does_not_match":
    case "account_already_linked_to_different_user":
    case "email_not_found":
    case "email_not_verified":
    case "break_glass_not_linkable":
      return "not_registered";
    case "state_mismatch":
    case "please_restart_the_process":
    case "no_code":
    case "invalid_code":
    case "oauth_provider_not_found":
    case "issuer_missing":
    case "issuer_mismatch":
    case "nonce_binding_missing":
    case "unable_to_get_user_info":
    case "no_callback_url":
    case "internal_server_error":
      return "session_missing";
    default:
      return undefined;
  }
}

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
