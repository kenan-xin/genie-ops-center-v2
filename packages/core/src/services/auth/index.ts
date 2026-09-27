import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

import {
  account,
  session,
  twoFactor,
  user,
  verification,
} from "../../schema.ts";
import {
  APPLICATION_USER_FIELDS,
  DISCOVERY_RETRY_MS,
  isSecurePublicUrl,
  keycloakIssuer,
  keycloakProviderConfig,
  SESSION_ABSOLUTE_SECONDS,
  sessionCookieName,
} from "./config.ts";
import { createDiscoveryProbe } from "./discovery.ts";
import type {
  AuthDiscoveryState,
  AuthMember,
  AuthMemberInput,
  AuthSession,
  DiscoveryResult,
} from "./types.ts";

export type {
  AuthDiscoveryCause,
  AuthDiscoveryState,
  AuthMember,
  AuthMemberInput,
  AuthSession,
  AuthSessionInput,
  AuthSessionUser,
  AuthSignOutInput,
  AuthSignOutResult,
} from "./types.ts";

export {
  APPLICATION_USER_FIELDS,
  DISCOVERY_RETRY_MS,
  discoveryDocumentUrl,
  HOST_COOKIE_PREFIX,
  isSecurePublicUrl,
  KEYCLOAK_PROVIDER_ID,
  keycloakIssuer,
  keycloakProviderConfig,
  normalizeKeycloakUrl,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_COOKIE_NAME,
  sessionCookieName,
} from "./config.ts";

export { createDiscoveryProbe, type DiscoveryProbe } from "./discovery.ts";

/**
 * The schema map the Drizzle adapter is handed explicitly (D2-5): core's `coreTables` keys
 * `two_factor`, but Better Auth addresses the model as `twoFactor`, so the map is built from the
 * table values under the model names rather than passing `coreTables` itself.
 */
const authSchema = { user, session, account, verification, twoFactor } as const;

/**
 * One Better Auth instance over the context's own pool (R-4). It is never a module singleton: it
 * is built here, per context, and stored on that context (DEC-34).
 *
 * Every option below is one of R-4a, R-5, R-7, R-8 or R-13, and the application columns are
 * `input: false` so no Better Auth endpoint can write them (D2-5). `useSecureCookies` is
 * deliberately off: in better-auth 1.7.6 the automatic secure prefix is `__Secure-` (see
 * `createCookieGetter`), and R-4a names the cookie `__Host-genie-session`, so the name is supplied
 * in full and the Secure flag comes from `defaultCookieAttributes` (see `sessionCookieName`).
 */
function buildInstance(input: AuthMemberInput) {
  const secure = isSecurePublicUrl(input.publicUrl);

  return betterAuth({
    baseURL: input.publicUrl,
    secret: input.auth.betterAuthSecret,
    // SAFETY: `db` is the tenant context's Drizzle client, which is a `NodePgDatabase` over the
    // context pool; the adapter's `DB` is an intentionally open object type and accepts it. The
    // cast only widens the type here, and the adapter calls the client it is given.
    database: drizzleAdapter(input.db as Parameters<typeof drizzleAdapter>[0], {
      provider: "pg",
      schema: authSchema,
    }),
    trustedOrigins: [input.publicUrl],
    telemetry: { enabled: false },
    user: { additionalFields: APPLICATION_USER_FIELDS },
    session: {
      expiresIn: SESSION_ABSOLUTE_SECONDS,
      // R-13: refresh would extend the absolute 24 hour cap, so it is off; `freshAge: 0` keeps the
      // sessions list working for a session older than a day, and the cookie cache stays off so a
      // revoked session is refused on the next request.
      disableSessionRefresh: true,
      freshAge: 0,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        trustedProviders: ["keycloak"],
        allowDifferentEmails: false,
        requireLocalEmailVerified: false,
      },
    },
    // Break-glass only: email and password is enabled, and sign-up is refused (R-62, D2-5).
    emailAndPassword: { enabled: true, disableSignUp: true },
    advanced: {
      useSecureCookies: false,
      crossSubDomainCookies: { enabled: false },
      // PUBLIC_URL fixes the host, so a forwarded host header is never trusted (R-4a, DEC-19).
      trustedProxyHeaders: false,
      cookies: { session_token: { name: sessionCookieName(input.publicUrl) } },
      defaultCookieAttributes: { secure },
      // R-4a, R-16: the client address comes from X-Forwarded-For only behind a trusted proxy.
      ipAddress: { trustedProxies: [...input.trustedProxies] },
    },
    plugins: [
      genericOAuth({
        config: [
          keycloakProviderConfig({
            keycloakUrl: input.auth.keycloakUrl,
            realm: input.auth.keycloakRealm,
            clientId: input.auth.keycloakClientId,
            clientSecret: input.auth.keycloakClientSecret,
            publicUrl: input.publicUrl,
          }),
        ],
      }),
    ],
  });
}

type BetterAuthInstance = ReturnType<typeof buildInstance>;

function toSession(
  value: Awaited<ReturnType<BetterAuthInstance["api"]["getSession"]>>
): AuthSession | null {
  if (value === null) return null;

  return {
    user: {
      id: value.user.id,
      email: value.user.email,
      name: value.user.name,
      emailVerified: value.user.emailVerified,
    },
    session: {
      id: value.session.id,
      userId: value.session.userId,
      expiresAt: value.session.expiresAt,
    },
  };
}

/**
 * Builds the context's one auth member (R-4, D2-5). The instance is built at start so break-glass
 * sign-in works while Keycloak is down (DEC-24). Discovery is read at start; while it has no good
 * answer, `ensureDiscovery` retries at most every ten seconds and, on the first good answer,
 * builds a fresh instance and swaps it in, so the provider the plugin dropped comes back (R-54d).
 * Sessions live in the database, so the swap loses nothing.
 */
export function createAuthMember(input: AuthMemberInput): AuthMember {
  const probe = createDiscoveryProbe({
    discoveryUrl: keycloakProviderConfig({
      keycloakUrl: input.auth.keycloakUrl,
      realm: input.auth.keycloakRealm,
      clientId: input.auth.keycloakClientId,
      clientSecret: input.auth.keycloakClientSecret,
      publicUrl: input.publicUrl,
    }).discoveryUrl,
    expectedIssuer: keycloakIssuer(
      input.auth.keycloakUrl,
      input.auth.keycloakRealm
    ),
    fetchImpl: input.fetchImpl ?? fetch,
  });

  const now = input.now ?? (() => Date.now());

  let instance = buildInstance(input);

  let discovery: AuthDiscoveryState = {
    ready: false,
    cause: "discovery_unreachable",
  };

  let endSessionEndpoint: string | undefined;

  let lastProbeAt = 0;

  let inFlight: Promise<AuthDiscoveryState> | undefined;

  function apply(result: DiscoveryResult): AuthDiscoveryState {
    if (result.ready) {
      endSessionEndpoint = result.endSessionEndpoint;

      // The provider was dropped when the instance was built while discovery failed, so a fresh
      // instance is built once the document answers and the member swaps it in (R-54d).
      if (!discovery.ready) instance = buildInstance(input);

      discovery = { ready: true };
    } else {
      discovery = result;
    }

    return discovery;
  }

  async function ensureDiscovery(): Promise<AuthDiscoveryState> {
    if (discovery.ready) return discovery;

    if (now() - lastProbeAt < DISCOVERY_RETRY_MS) return discovery;

    lastProbeAt = now();

    inFlight ??= probe
      .probe()
      .then((result) => apply(result))
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  }

  // R-54d: the document is read at start. It does not block construction; the first caller that
  // needs it (health or sign-in) reads the settled state.
  void ensureDiscovery().catch(() => {
    // A failed read is a `degraded` state, not a thrown start; the retry is the sign-in path.
  });

  return {
    handler: (request) => instance.handler(request),

    async getSession({ headers }) {
      const value = await instance.api.getSession({ headers });

      return toSession(value);
    },

    async beginKeycloakSignIn({ headers, callbackURL, errorCallbackURL }) {
      const result = await instance.api.signInSocial({
        headers,
        body: {
          provider: "keycloak",
          callbackURL,
          errorCallbackURL,
          disableRedirect: true,
        },
      });

      return { url: result.url };
    },

    async signOut({ headers, callbackURL }) {
      // Better Auth deletes the session row, clears the cookie, and returns the realm's
      // end-session URL with `id_token_hint` from the one stored token read (R-17, R-7).
      const { headers: responseHeaders, response } = await instance.api.signOut(
        {
          headers,
          body: { callbackURL, disableRedirect: true },
          returnHeaders: true,
        }
      );

      return {
        providerLogoutUrl: response.url,
        headers: responseHeaders,
      };
    },

    discovery: () => discovery,

    ensureDiscovery,

    endSessionEndpoint: () => endSessionEndpoint,
  };
}
