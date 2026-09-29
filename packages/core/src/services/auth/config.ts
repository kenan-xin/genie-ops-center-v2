import { z } from "zod";

import { normalizeKeycloakUrl } from "../keycloak/normalize-url.ts";

/**
 * The pure builders behind the Better Auth instance: the cookie name, the discovery URL, the
 * Keycloak provider record, and the application user columns. Keeping them apart makes each
 * value (R-4a, R-5, R-13) unit-testable without opening a connection or a network call.
 */

/** The stable named cause an issuer mismatch carries at sign-in and at start (R-54d). */
export const KEYCLOAK_ISSUER_MISMATCH = "keycloak_issuer_mismatch";

export { normalizeKeycloakUrl };

/** The repository's session cookie name, without a prefix (R-4a). */
export const SESSION_COOKIE_NAME = "genie-session";

/** The prefix a `__Host-` cookie carries over HTTPS (R-4a). */
export const HOST_COOKIE_PREFIX = "__Host-";

/** The fixed 24 hour absolute session cap (R-13). */
export const SESSION_ABSOLUTE_SECONDS = 86_400;

/** R-54d: at most one discovery retry in this window while the document does not answer. */
export const DISCOVERY_RETRY_MS = 10_000;

/** A discovery read that hangs is treated as not answering, so sign-in never waits forever. */
export const DISCOVERY_TIMEOUT_MS = 5_000;

/** The one provider this instance registers (R-5, R-6). */
export const KEYCLOAK_PROVIDER_ID = "keycloak";

/** True for a base URL that carries TLS; only then may the `__Host-` prefix and Secure apply. */
export function isSecurePublicUrl(publicUrl: string): boolean {
  return publicUrl.startsWith("https://");
}

/**
 * The session cookie's exact name (R-4a). Better Auth's own secure prefix is `__Secure-`, so the
 * `__Host-` name R-4a names is supplied here in full, and `advanced.useSecureCookies` is left off
 * to stop the automatic `__Secure-` prefix from doubling it. The Secure attribute still applies
 * over HTTPS through `defaultCookieAttributes.secure`.
 */
export function sessionCookieName(publicUrl: string): string {
  return isSecurePublicUrl(publicUrl)
    ? `${HOST_COOKIE_PREFIX}${SESSION_COOKIE_NAME}`
    : SESSION_COOKIE_NAME;
}

/** The realm's issuer, the value a discovery document must name (R-54d). */
export function keycloakIssuer(keycloakUrl: string, realm: string): string {
  return `${normalizeKeycloakUrl(keycloakUrl)}/realms/${realm}`;
}

/** `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration` (R-5). */
export function discoveryDocumentUrl(
  keycloakUrl: string,
  realm: string
): string {
  return `${keycloakIssuer(keycloakUrl, realm)}/.well-known/openid-configuration`;
}

export type KeycloakProviderInput = {
  readonly keycloakUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly publicUrl: string;
};

const idTokenClaims = z.looseObject({
  sub: z.string(),
  email: z.string(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

/** Generic OAuth calls this only after verifying a present ID token against Keycloak's JWKS. */
function verifiedIdTokenProfile(idToken: string | undefined) {
  if (idToken === undefined) return null;

  const payload = idToken.split(".")[1];

  if (payload === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    const result = idTokenClaims.safeParse(parsed);

    if (!result.success) return null;

    const claims = result.data;
    const { sub, email } = claims;

    return {
      ...claims,
      id: sub,
      sub,
      email,
      emailVerified: claims.email_verified === true,
      image: claims.picture,
      name: claims.name,
    };
  } catch {
    return null;
  }
}

/**
 * The `genericOAuth` provider for Keycloak (R-5): the discovery URL, PKCE on, verified id tokens
 * required so an incomplete discovery answer cannot downgrade the signature and `aud` checks
 * (R-54d), and the public URL as the post-logout redirect.
 */
export function keycloakProviderConfig(input: KeycloakProviderInput) {
  return {
    providerId: KEYCLOAK_PROVIDER_ID,
    discoveryUrl: discoveryDocumentUrl(input.keycloakUrl, input.realm),
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    scopes: ["openid", "profile", "email"],
    pkce: true,
    requireIdTokenVerification: true,
    // A missing ID token must not fall back to userinfo. The plugin verifies a present token
    // before calling this function, so these are the only claims onboarding may consume.
    getUserInfo: async (tokens: { readonly idToken?: string | undefined }) =>
      verifiedIdTokenProfile(tokens.idToken),
    postLogoutRedirectURI: input.publicUrl,
    // The member builds the end-session URL itself, because the stored id token is encrypted and
    // Better Auth would put the ciphertext into `id_token_hint` (R-7, R-17).
    disableProviderLogout: true,
  };
}

/** An `xxx.yyy.zzz` value: a JWT, which an encrypted column never holds (R-7). */
export function isPlainJwt(value: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]*$/.test(value);
}

/**
 * The application columns no Better Auth endpoint may write (`input: false`, D2-5). They are
 * written with Drizzle by setup steps, operator commands, onboarding and the session hook.
 */
export const APPLICATION_USER_FIELDS = {
  status: { type: "string", required: false, input: false },
  mustChangePassword: { type: "boolean", required: false, input: false },
  isBreakGlass: { type: "boolean", required: false, input: false },
  onboarding: { type: "string", required: false, input: false },
  firstSignInAt: { type: "date", required: false, input: false },
  lastSignInAt: { type: "date", required: false, input: false },
  erasedAt: { type: "date", required: false, input: false },
  // Written only by the admin and two-factor plugins, which are not installed yet. Declared here so
  // that installing one later cannot make them writable by accident (D2-5).
  banned: { type: "boolean", required: false, input: false },
  banReason: { type: "string", required: false, input: false },
  banExpires: { type: "date", required: false, input: false },
  twoFactorEnabled: { type: "boolean", required: false, input: false },
} as const;

/**
 * The application columns on `session` no Better Auth endpoint may write (`input: false`).
 * `lastActiveAt` is the idle check's one column (R-15): only the activity call writes it, and
 * declaring it here lets the enforced session read see it in the row Better Auth already
 * selected, without a second query.
 */
export const APPLICATION_SESSION_FIELDS = {
  lastActiveAt: { type: "date", required: false, input: false },
} as const;
