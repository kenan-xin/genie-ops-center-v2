import type {
  AuthEnvironment,
  RuntimeMode,
} from "../../lib/tenant-context/index.ts";

/** Why the discovery document is not usable yet (Spec 2 R-54d). */
export type AuthDiscoveryCause = "discovery_unreachable" | "issuer_mismatch";

/**
 * Whether the realm's discovery document answered and named the configured issuer. While it is
 * not `ready`, `/api/health` answers `degraded` and sign-in refuses with a named cause (R-54d).
 */
export type AuthDiscoveryState =
  | { readonly ready: true }
  | { readonly ready: false; readonly cause: AuthDiscoveryCause };

/** The answer of one discovery read (R-54d). */
export type DiscoveryResult =
  | { readonly ready: true; readonly endSessionEndpoint: string | undefined }
  | { readonly ready: false; readonly cause: AuthDiscoveryCause };

/** The signed-in person and session as the request path reads them (R-27). */
export type AuthSessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
};

export type AuthSession = {
  readonly user: AuthSessionUser;
  readonly session: {
    readonly id: string;
    readonly userId: string;
    readonly expiresAt: Date;
  };
};

export type AuthSessionInput = {
  readonly headers: Headers;
};

export type AuthSignOutInput = {
  readonly headers: Headers;
  /** The `post_logout_redirect_uri` the realm should send the browser back to (R-17). */
  readonly callbackURL: string;
};

/**
 * The result of deleting the session row. The provider logout URL is present when the realm's
 * `end_session_endpoint` is known and an account carried an id token; the caller decides whether
 * to use it (R-17: managed mode redirects, client-only mode does not). `headers` carries Better
 * Auth's own `Set-Cookie` that clears the session cookie, which the caller must copy onto its
 * redirect so the browser forgets the deleted session.
 */
export type AuthSignOutResult = {
  readonly providerLogoutUrl: string | undefined;
  readonly headers: Headers;
};

/**
 * The one Better Auth instance of a tenant context (R-4), behind a narrow core surface so the
 * app never imports better-auth directly and a second context can hold its own member (DEC-34).
 * A profile that does not consume authentication builds no member.
 */
export type AuthMember = {
  /** The Better Auth handler, mounted once under `/api/auth/` (D2-5). */
  readonly handler: (request: Request) => Promise<Response>;
  /** The signed-in session for this request's headers, or null. */
  readonly getSession: (input: AuthSessionInput) => Promise<AuthSession | null>;
  /**
   * Starts the Keycloak sign-in (`signIn.social({ provider: "keycloak" })`, R-6) and returns the
   * realm's authorization URL for the caller to redirect the browser to, plus the response headers
   * (the short-lived OAuth state/PKCE cookie) the caller must copy onto that redirect.
   * `errorCallbackURL` is the sign-in page so a refusal lands there with `?error=` (R-17a).
   */
  readonly beginKeycloakSignIn: (input: {
    readonly headers: Headers;
    readonly callbackURL: string;
    readonly errorCallbackURL: string;
  }) => Promise<{
    readonly url: string | undefined;
    readonly headers: Headers;
  }>;
  /** Deletes the session row, clears the cookie, and reports the provider logout URL (R-17). */
  readonly signOut: (input: AuthSignOutInput) => Promise<AuthSignOutResult>;
  /** The current discovery state, without probing. */
  readonly discovery: () => AuthDiscoveryState;
  /** Probes discovery at most once every ten seconds while it has no good answer (R-54d). */
  readonly ensureDiscovery: () => Promise<AuthDiscoveryState>;
  /** The realm's `end_session_endpoint` from the last good discovery answer, if any. */
  readonly endSessionEndpoint: () => string | undefined;
};

export type AuthMemberInput = {
  /** The context's Drizzle client; the instance opens no connection of its own (R-4). */
  readonly db: unknown;
  readonly publicUrl: string;
  readonly auth: AuthEnvironment;
  readonly trustedProxies: readonly string[];
  readonly runtimeMode: RuntimeMode;
  /** Injected by a test; the process uses the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injected by a test; the process uses `Date.now`. */
  readonly now?: () => number;
};
