import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  AuthEnvironment,
  RuntimeMode,
  SettingsReader,
} from "../../lib/tenant-context/index.ts";
import type { RedactingLogger } from "../logging/index.ts";

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
    /** When the session row was created; the idle baseline until the first activity call. */
    readonly createdAt: Date;
    /** The activity call's one column (R-15); null until the first activity call. */
    readonly lastActiveAt: Date | null;
  };
};

/**
 * What one enforced session read answers (R-14). `idle-expired` names the request whose own
 * session the idle rule just deleted, so a caller can land the browser on the session-expired
 * banner rather than the plain signed-out state; `anonymous` is every request without a live
 * session, including the one after a revoked row.
 */
export type AuthSessionState =
  | { readonly status: "authenticated"; readonly session: AuthSession }
  | { readonly status: "idle-expired" }
  | { readonly status: "anonymous" };

export type AuthSessionInput = {
  readonly headers: Headers;
};

export type AuthSignOutInput = {
  readonly headers: Headers;
  /** The `post_logout_redirect_uri` the realm should send the browser back to (R-17). */
  readonly callbackURL: string;
};

/**
 * One row of the person's own Sessions block (R-18): the display classifier's device and browser
 * lines, the client address as an address (R-16), and the two timestamps the block shows. The
 * current session is first and carries `isCurrent`; the block's per-row sign-out refuses it.
 */
export type AuthOwnSession = {
  readonly id: string;
  readonly device: string;
  readonly browser: string;
  readonly ipAddress: string;
  readonly signedInAt: Date;
  readonly lastActiveAt: Date;
  readonly isCurrent: boolean;
};

/** The activity call's answer: the absolute idle expiry the call just wrote (R-15a). */
export type AuthActivityResult = { readonly idleExpiresAt: Date };

/** What one per-row sign-out answers. */
export type AuthRevokeSessionResult =
  | "revoked"
  | "current"
  | "not-found"
  | "unauthenticated";

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
  /**
   * The signed-in session for this request's headers, or null. The read enforces the idle rule
   * (R-14): a session past the tenant's idle window is deleted here and answered as null, so
   * every caller of the member - the request principal, the page loader, the activity call -
   * refuses it on the same comparison.
   */
  readonly getSession: (input: AuthSessionInput) => Promise<AuthSession | null>;
  /**
   * The enforced read with its cause (R-14, R-17a): a caller that must tell an idle-expired
   * browser from one that never signed in - the account page's redirect - reads this instead of
   * `getSession` and gets the same single database read.
   */
  readonly sessionState: (input: AuthSessionInput) => Promise<AuthSessionState>;
  /**
   * The browser activity call (R-15): the one writer of `session.last_active_at`, throttled to
   * half the idle window by the client. Answers the new absolute idle expiry (R-15a), or null
   * when the request holds no live session.
   */
  readonly recordActivity: (
    input: AuthSessionInput
  ) => Promise<AuthActivityResult | null>;
  /**
   * The person's own Sessions block rows (R-18): live sessions only, current first, or null when
   * the request holds no live session.
   */
  readonly listOwnSessions: (
    input: AuthSessionInput
  ) => Promise<readonly AuthOwnSession[] | null>;
  /**
   * Per-session sign-out (R-18). The current session is refused with `current` - the block marks
   * it and offers no revoke - and a row that is not the caller's own answers `not-found`.
   */
  readonly revokeOwnSession: (input: {
    readonly headers: Headers;
    readonly sessionId: string;
  }) => Promise<AuthRevokeSessionResult>;
  /**
   * Sign out everywhere (R-18): deletes every session except the current one, and answers the
   * number deleted, or null when the request holds no live session.
   */
  readonly revokeOtherOwnSessions: (
    input: AuthSessionInput
  ) => Promise<number | null>;
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
};

export type AuthMemberInput = {
  /** The context's Drizzle client; the instance opens no connection of its own (R-4). */
  readonly db: NodePgDatabase<Record<string, never>>;
  /** The context's redacting logger; Better Auth writes every line through it (R-44, R-45). */
  readonly logger: Pick<RedactingLogger, "error" | "info">;
  /**
   * The context's settings reader, the one read of `tenant_settings` (DEC-46, R-14): the idle
   * rule reads `session_idle_minutes` through it on every enforced session read, behind its
   * ten-second cache.
   */
  readonly settings: Pick<SettingsReader, "get">;
  readonly publicUrl: string;
  readonly auth: AuthEnvironment;
  readonly trustedProxies: readonly string[];
  readonly runtimeMode: RuntimeMode;
  /** Injected by a test; the process uses the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injected by a test; the process uses `Date.now`. */
  readonly now?: () => number;
};
