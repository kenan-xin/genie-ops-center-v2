import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { and, desc, eq } from "drizzle-orm";

import {
  account,
  session,
  twoFactor,
  user,
  verification,
} from "../../schema.ts";
import type { LogValue } from "../logging/index.ts";
import {
  APPLICATION_USER_FIELDS,
  DISCOVERY_RETRY_MS,
  DISCOVERY_TIMEOUT_MS,
  isPlainJwt,
  isSecurePublicUrl,
  KEYCLOAK_PROVIDER_ID,
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
  isPlainJwt,
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
 * The named cause a realm sign-in gets when its email belongs to the break-glass account. It
 * reaches the sign-in page as `?error=` through the callback's error redirect (R-62, H1).
 */
export const BREAK_GLASS_NOT_LINKABLE = "break_glass_not_linkable";

/** Better Auth's own provider id for an email and password account. */
const CREDENTIAL_PROVIDER_ID = "credential";

/**
 * R-7: the id token rests encrypted with the same scheme Better Auth uses for the access and
 * refresh tokens (`encryptOAuthTokens`, a symmetric key from the application secret). Better Auth
 * 1.7.6 encrypts only those two, so this seals the third. A value that is not JWT-shaped is
 * already sealed, so a second pass changes nothing.
 */
async function sealIdToken(
  secret: string,
  idToken: string | null | undefined
): Promise<string | undefined> {
  if (idToken === null || idToken === undefined || !isPlainJwt(idToken))
    return undefined;

  return symmetricEncrypt({ key: secret, data: idToken });
}

/**
 * The account hooks (R-7, R-62). Every account write passes here: the id token is sealed, and a
 * provider account for the break-glass user is refused, because linking by email would let a realm
 * identity with that email hold the break-glass session and skip `/admin/login` (R-62).
 */
export function accountHooks(input: Pick<AuthMemberInput, "auth" | "db">) {
  const secret = input.auth.betterAuthSecret;

  return {
    create: {
      async before(data: {
        readonly providerId: string;
        readonly userId: string;
        readonly idToken?: string | null | undefined;
      }) {
        if (data.providerId !== CREDENTIAL_PROVIDER_ID) {
          const [owner] = await input.db
            .select({ isBreakGlass: user.isBreakGlass })
            .from(user)
            .where(eq(user.id, data.userId));

          if (owner?.isBreakGlass === true) {
            throw new APIError("FORBIDDEN", {
              code: BREAK_GLASS_NOT_LINKABLE,
              message: "The break-glass account signs in only at /admin/login.",
            });
          }
        }

        const idToken = await sealIdToken(secret, data.idToken);

        return idToken === undefined ? undefined : { data: { idToken } };
      },
    },
    update: {
      async before(data: { readonly idToken?: string | null | undefined }) {
        const idToken = await sealIdToken(secret, data.idToken);

        return idToken === undefined ? undefined : { data: { idToken } };
      },
    },
  };
}

/** Rejects when `work` does not settle within `timeoutMs`. */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
  });

  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

/**
 * One Better Auth instance over the context's own pool (R-4). It is never a module singleton: it
 * is built here, per context, and stored on that context (DEC-34).
 *
 * Every option below is one of R-4a, R-5, R-7, R-8 or R-13, and the application columns are
 * `input: false` so no Better Auth endpoint can write them (D2-5). `useSecureCookies` is
 * deliberately off: in better-auth 1.7.6 the automatic secure prefix is `__Secure-` (see
 * `createCookieGetter`), and R-4a names the cookie `__Host-genie-session`, so the name is supplied
 * in full and the Secure flag comes from `defaultCookieAttributes` (see `sessionCookieName`).
 *
 * `withKeycloak: false` builds the break-glass-only instance: it has no provider plugin, so it
 * does no network read at all and cannot wait on a realm that hangs (DEC-24, R-54d).
 */
function buildInstance(input: AuthMemberInput, withKeycloak: boolean) {
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
    // R-44, R-45: every Better Auth line goes through the context's redacting logger.
    logger: {
      log: (level, message, ...args: unknown[]) => {
        // SAFETY: the arguments are the values Better Auth logs beside its message, which the
        // redacting logger serializes as json and redacts on the way.
        const fields = { betterAuth: args as LogValue };

        if (level === "error" || level === "warn")
          input.logger.error(fields, message);
        else input.logger.info(fields, message);
      },
    },
    databaseHooks: { account: accountHooks(input) },
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
    plugins: withKeycloak
      ? [
          genericOAuth({
            config: [keycloakProviderConfig(providerInput(input))],
          }),
        ]
      : [],
  });
}

function providerInput(input: AuthMemberInput) {
  return {
    keycloakUrl: input.auth.keycloakUrl,
    realm: input.auth.keycloakRealm,
    clientId: input.auth.keycloakClientId,
    clientSecret: input.auth.keycloakClientSecret,
    publicUrl: input.publicUrl,
  };
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
 * The realm's end-session URL for one signed-out person (R-17): `id_token_hint` when an id token is
 * stored, then `post_logout_redirect_uri` and `client_id`, which is the fallback Keycloak answers
 * with its confirmation page when no id token is stored. The same parameters the provider plugin
 * builds, built here because only this member can unseal the id token (R-7).
 */
function endSessionUrl(input: {
  readonly endSessionEndpoint: string;
  readonly idToken: string | undefined;
  readonly postLogoutRedirectUri: string;
  readonly clientId: string;
}): string {
  const url = new URL(input.endSessionEndpoint);

  if (input.idToken !== undefined)
    url.searchParams.set("id_token_hint", input.idToken);

  url.searchParams.set("post_logout_redirect_uri", input.postLogoutRedirectUri);
  url.searchParams.set("client_id", input.clientId);

  return url.toString();
}

/**
 * Builds the context's one auth member (R-4, D2-5). The start instance has no provider plugin, so
 * break-glass sign-in and every session read answer at once, even while Keycloak hangs (DEC-24).
 * Discovery is read at start; while it has no good answer, `ensureDiscovery` retries at most every
 * ten seconds (R-54d). On a good answer the member builds the full instance, waits for its context
 * under the discovery timeout, and swaps it in only when the Keycloak provider survived the
 * plugin's own discovery read. Sessions live in the database, so the swap loses nothing.
 */
export function createAuthMember(input: AuthMemberInput): AuthMember {
  const probe = createDiscoveryProbe({
    discoveryUrl: keycloakProviderConfig(providerInput(input)).discoveryUrl,
    expectedIssuer: keycloakIssuer(
      input.auth.keycloakUrl,
      input.auth.keycloakRealm
    ),
    fetchImpl: input.fetchImpl ?? fetch,
  });

  const now = input.now ?? (() => Date.now());

  let instance: BetterAuthInstance = buildInstance(input, false);

  let discovery: AuthDiscoveryState = {
    ready: false,
    cause: "discovery_unreachable",
  };

  let endSessionEndpoint: string | undefined;

  let lastProbeAt = 0;

  let inFlight: Promise<AuthDiscoveryState> | undefined;

  /**
   * The full instance, or undefined when its provider did not come up. The plugin reads discovery
   * again with no timeout of its own, so its context is awaited under the same bound as the probe;
   * a read that hangs past it leaves the member degraded and the half-built instance is dropped.
   */
  async function fullInstance(): Promise<BetterAuthInstance | undefined> {
    const next = buildInstance(input, true);

    try {
      const context = await withTimeout(next.$context, DISCOVERY_TIMEOUT_MS);

      return context.socialProviders.some(
        (provider) => provider.id === KEYCLOAK_PROVIDER_ID
      )
        ? next
        : undefined;
    } catch {
      return undefined;
    }
  }

  async function apply(result: DiscoveryResult): Promise<AuthDiscoveryState> {
    if (!result.ready) {
      discovery = result;

      return discovery;
    }

    const next = await fullInstance();

    if (next === undefined) {
      discovery = { ready: false, cause: "discovery_unreachable" };

      return discovery;
    }

    instance = next;
    endSessionEndpoint = result.endSessionEndpoint;
    discovery = { ready: true };

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

  /** The one read of a stored id token (R-7, R-17), unsealed for `id_token_hint`. */
  async function storedIdToken(
    userId: string
  ): Promise<string | null | undefined> {
    const [row] = await input.db
      .select({ idToken: account.idToken })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, KEYCLOAK_PROVIDER_ID)
        )
      )
      .orderBy(desc(account.updatedAt))
      .limit(1);

    // No Keycloak account: a break-glass session, which has no realm session to end.
    if (row === undefined) return undefined;

    // A value that does not unseal (a rotated secret) is treated as no stored token, so sign-out
    // falls back to `client_id` rather than failing (R-17).
    if (row.idToken === null) return null;

    return symmetricDecrypt({
      key: input.auth.betterAuthSecret,
      data: row.idToken,
    }).catch(() => null);
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
      const { headers: responseHeaders, response } =
        await instance.api.signInSocial({
          headers,
          body: {
            provider: KEYCLOAK_PROVIDER_ID,
            callbackURL,
            errorCallbackURL,
            disableRedirect: true,
          },
          returnHeaders: true,
        });

      // The state/PKCE cookie Better Auth set lives on `responseHeaders`; the caller must copy it
      // onto the redirect, or the callback cannot verify the state it issued.
      return { url: response.url, headers: responseHeaders };
    },

    async signOut({ headers, callbackURL }) {
      // The id token is read before the session row goes, because the row names the person.
      const current = await instance.api.getSession({ headers });

      const idToken =
        current === null ? undefined : await storedIdToken(current.user.id);

      // Better Auth deletes the session row and clears the cookie (R-17).
      const { headers: responseHeaders } = await instance.api.signOut({
        headers,
        body: { callbackURL, disableRedirect: true },
        returnHeaders: true,
      });

      const providerLogoutUrl =
        idToken === undefined || endSessionEndpoint === undefined
          ? undefined
          : endSessionUrl({
              endSessionEndpoint,
              idToken: idToken ?? undefined,
              postLogoutRedirectUri: callbackURL,
              clientId: input.auth.keycloakClientId,
            });

      return { providerLogoutUrl, headers: responseHeaders };
    },

    discovery: () => discovery,

    ensureDiscovery,
  };
}
