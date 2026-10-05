import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins/two-factor";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
/* oxlint-disable anti-slop/require-readable-spacing -- the Better Auth hook scopes keep adjacent guards and writes together. */

import { meetsPasswordRule } from "../../lib/password/index.ts";
import {
  account,
  session,
  twoFactor,
  user,
  verification,
} from "../../schema.ts";
import { writeAuthAuditEvent } from "../audit/index.ts";
import type { LogValue } from "../logging/index.ts";
import {
  consumeRateLimit,
  DEPLOYMENT_RATE_LIMIT_SUBJECT,
} from "../rate-limit/index.ts";
import {
  APPLICATION_SESSION_FIELDS,
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
  TOTP_ISSUER_DEFAULT,
} from "./config.ts";
import { createDiscoveryProbe } from "./discovery.ts";
import { idleExpiry, isIdleExpired } from "./idle.ts";
import { syncGroupMemberships, validateOAuthUser } from "./onboarding.ts";
import { recordOAuthSignIn } from "./session-events.ts";
import type {
  AuthDiscoveryState,
  AuthMember,
  AuthMemberInput,
  AuthOwnSession,
  AuthSession,
  AuthSessionState,
  DiscoveryResult,
} from "./types.ts";
import { describeUserAgent } from "./user-agent.ts";

export type {
  AuthActivityResult,
  AuthDiscoveryCause,
  AuthDiscoveryState,
  AuthMember,
  AuthMemberInput,
  AuthOwnSession,
  AuthRevokeSessionResult,
  AuthSession,
  AuthSessionInput,
  AuthSessionState,
  AuthSessionUser,
  AuthSignOutInput,
  AuthSignOutResult,
} from "./types.ts";

export { activityThrottleWaitMs, idleExpiry, isIdleExpired } from "./idle.ts";

export { describeUserAgent } from "./user-agent.ts";

export {
  APPLICATION_SESSION_FIELDS,
  APPLICATION_USER_FIELDS,
  DISCOVERY_RETRY_MS,
  discoveryDocumentUrl,
  HOST_COOKIE_PREFIX,
  isPlainJwt,
  isSecurePublicUrl,
  KEYCLOAK_ISSUER_MISMATCH,
  KEYCLOAK_PROVIDER_ID,
  keycloakIssuer,
  keycloakProviderConfig,
  normalizeKeycloakUrl,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_COOKIE_NAME,
  sessionCookieName,
  TOTP_ISSUER_DEFAULT,
} from "./config.ts";

export { createDiscoveryProbe, type DiscoveryProbe } from "./discovery.ts";

export {
  type BreakGlassFacts,
  type BreakGlassStep,
  breakGlassNextStep,
  breakGlassSteps,
  isLimitedBreakGlass,
  LIMITED_SESSION_CLEARING_ENDPOINTS,
} from "./limited.ts";

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

/**
 * The neutral message a credential sign-in for a non-break-glass account answers with. It is
 * Better Auth's own `BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD` message exactly, so a caller
 * cannot tell "correct password, wrong account" from "wrong password" (R-62, review L1).
 */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

/** Better Auth's `BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD` code (UNAUTHORIZED). */
export const INVALID_EMAIL_OR_PASSWORD_CODE = "INVALID_EMAIL_OR_PASSWORD";

/** The named cause a non-break-glass session is refused on a break-glass-only endpoint (R-62). */
export const BREAK_GLASS_ONLY_CODE = "break_glass_only";

/** The named cause the R1 guard refuses an OAuth session for the break-glass account with (R1). */
export const BREAK_GLASS_OAUTH_REFUSED = "break_glass_oauth_refused";

/** The named cause a `trustDevice`-carrying code verification is refused with (B1, R-63). */
export const TRUST_DEVICE_REFUSED = "trust_device_refused";

/** The response code the break-glass sign-in card maps to its neutral notice (R-21). */
export const RATE_LIMITED_CODE = "rate_limited";

/** The named cause a password that misses the R-64 rule is refused with. */
export const PASSWORD_POLICY_CODE = "password_policy";

/**
 * The two-factor plugin's challenge cookie name, under this instance's cookie prefix (better-auth
 * 1.7.6 `createCookieGetter`). A code step carries it; the enrollment confirmation, which runs on
 * a real session, does not (B2).
 */
const TWO_FACTOR_CHALLENGE_COOKIE = "two_factor";

/** The one value of `name` in a `Cookie` header, or undefined (no decoding: tokens are opaque). */
export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");

    if (separator === -1) continue;

    if (trimmed.slice(0, separator) === name)
      return trimmed.slice(separator + 1) || undefined;
  }

  return undefined;
}

/** The change-password body the R-64 server check reads; unknown fields are ignored. */
const changePasswordBody = z.object({
  newPassword: z.string(),
  currentPassword: z.string(),
});

/** The one field the trust-device refusal reads; every other field is stripped (B1). */
const trustDeviceBody = z.object({
  trustDevice: z.boolean().optional(),
});

/**
 * R1 and R-62, the session guard. Every session creation passes here:
 *
 * - a break-glass session is allowed only from the credential path, never from a realm callback,
 *   so an old provider account row for that email cannot carry the bypass (R1);
 * - an ordinary person's only sign-in path is the realm, so a credential session for one is
 *   refused with a neutral message and no session (R-62).
 *
 * It is exported so an integration test can drive both directions with a real database and a
 * fake request scope, without a full OAuth callback.
 */
export function sessionCreateBefore(
  input: Pick<AuthMemberInput, "db" | "requestScope">
) {
  return async (data: { readonly userId: string }): Promise<void> => {
    const [owner] = await input.db
      .select({ isBreakGlass: user.isBreakGlass })
      .from(user)
      .where(eq(user.id, data.userId));
    const isBreakGlass = owner?.isBreakGlass === true;
    const fromOAuth = input.requestScope?.current()?.oauth === true;

    if (isBreakGlass && fromOAuth) {
      throw new APIError("FORBIDDEN", {
        code: BREAK_GLASS_OAUTH_REFUSED,
        message: "The break-glass account signs in only at /admin/login.",
      });
    }

    if (!isBreakGlass && !fromOAuth) {
      throw new APIError("UNAUTHORIZED", {
        code: INVALID_EMAIL_OR_PASSWORD_CODE,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }
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
    // R-19 to R-21: the application's own fixed window (`rate_limit_window`) is the one limit on
    // the sensitive endpoints, so Better Auth's built-in in-memory limiter is off. That also turns
    // off the plugin's global `/two-factor/*` rule (3 per 10 s); what remains is the plugin's
    // per-challenge budget (5 tries) and the account lockout (10 failures, 15 minutes), both on
    // the sign-in code step, plus the member's own `break_glass_password` window on the password
    // checks (S3).
    rateLimit: { enabled: false },
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
    databaseHooks:
      input.tenant === undefined || input.requestScope === undefined
        ? { account: accountHooks(input) }
        : {
            account: {
              ...accountHooks(input),
              update: {
                ...accountHooks(input).update,
                async after(data, context) {
                  if (
                    data.providerId !== CREDENTIAL_PROVIDER_ID ||
                    data.password === null ||
                    data.password === undefined
                  )
                    return;
                  const [owner] = await input.db
                    .select({
                      isBreakGlass: user.isBreakGlass,
                      mustChangePassword: user.mustChangePassword,
                      twoFactorEnabled: user.twoFactorEnabled,
                    })
                    .from(user)
                    .where(eq(user.id, data.userId));
                  // R-65: the first successful change of the provisioning password clears the
                  // forced-change condition. When the authenticator is already enrolled both
                  // conditions are done, so the account's other sessions go.
                  if (owner?.mustChangePassword !== true) return;
                  await input.db
                    .update(user)
                    .set({ mustChangePassword: false, updatedAt: sql`now()` })
                    .where(eq(user.id, data.userId));
                  // L3: the forced break-glass password change is audited once (R-44, R-45).
                  const tenant = input.tenant?.();
                  if (owner.isBreakGlass === true && tenant !== undefined) {
                    await writeAuthAuditEvent(tenant, {
                      action: "auth:break_glass_password_changed",
                      actorUserId: data.userId,
                      targetUserId: data.userId,
                      summary: "Break-glass password changed",
                    });
                  }
                  if (owner.twoFactorEnabled !== true) return;
                  // SAFETY: `GenericEndpointContext.context` is the endpoint's own context, whose
                  // `session` is the signed-in session on the change-password path; the cast only
                  // names the one field read here and no value crosses a boundary.
                  const currentSessionId = (
                    context as {
                      readonly context?: {
                        readonly session?: {
                          readonly session?: {
                            readonly id?: string | undefined;
                          };
                        } | null;
                      };
                    } | null
                  )?.context?.session?.session?.id;
                  if (currentSessionId === undefined) return;
                  await input.db
                    .delete(session)
                    .where(
                      and(
                        eq(session.userId, data.userId),
                        ne(session.id, currentSessionId)
                      )
                    );
                },
              },
            },
            user: {
              create: {
                async before(_data: { readonly email: string }) {
                  const facts = input.requestScope?.current();
                  if (facts?.oauth !== true || facts.groups === undefined)
                    return;
                  return { data: { status: "active", onboarding: "jit" } };
                },
              },
            },
            session: {
              create: {
                before: sessionCreateBefore(input),
                async after(data: {
                  readonly userId: string;
                  readonly userAgent?: string | null | undefined;
                }) {
                  const facts = input.requestScope?.current();
                  if (facts?.oauth !== true) return;
                  const tenant = input.tenant?.();
                  if (tenant === undefined) return;
                  await syncGroupMemberships(tenant, data.userId, facts.groups);
                  await recordOAuthSignIn(tenant, data);
                },
              },
            },
          },
    user: {
      additionalFields: APPLICATION_USER_FIELDS,
      async validateUserInfo(data) {
        if (input.tenant === undefined || input.requestScope === undefined)
          return undefined;
        return validateOAuthUser({
          tenant: input.tenant(),
          scope: input.requestScope,
          data,
        });
      },
    },
    session: {
      expiresIn: SESSION_ABSOLUTE_SECONDS,
      // R-13: refresh would extend the absolute 24 hour cap, so it is off; `freshAge: 0` keeps the
      // sessions list working for a session older than a day, and the cookie cache stays off so a
      // revoked session is refused on the next request.
      disableSessionRefresh: true,
      freshAge: 0,
      cookieCache: { enabled: false },
      // `lastActiveAt` reaches the enforced session read in the row Better Auth already selected;
      // no endpoint writes it (R-15, D2-5).
      additionalFields: APPLICATION_SESSION_FIELDS,
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const tenant = input.tenant?.();
        if (tenant === undefined) return;

        if (ctx.path === "/sign-in/email") {
          // R-19 to R-21: every credential attempt counts against the per-deployment window,
          // and a refusal is one `auth:rate_limited` row with the neutral minutes the card shows.
          const decision = await consumeRateLimit(tenant, {
            endpoint: "break_glass_sign_in",
            subject: DEPLOYMENT_RATE_LIMIT_SUBJECT,
          });
          if (!decision.allowed) {
            await writeAuthAuditEvent(tenant, {
              action: "auth:rate_limited",
              summary:
                "Break-glass sign-in refused by the fixed-window rate limit",
              metadata: {
                endpoint: decision.endpoint,
                subjectKind: decision.subjectKind,
                windowMinutes: decision.windowMinutes,
                retryAfterMinutes: decision.retryAfterMinutes,
              },
            });
            return new Response(
              JSON.stringify({
                code: RATE_LIMITED_CODE,
                retryAfterMinutes: decision.retryAfterMinutes,
              }),
              { status: 429, headers: { "content-type": "application/json" } }
            );
          }
          return;
        }

        // B1: device trust is never available to the break-glass account (R-63), so one code
        // cannot stand in for the code step on every later sign-in.
        if (ctx.path === "/two-factor/verify-totp") {
          const body = trustDeviceBody.safeParse(ctx.body);
          if (body.success && body.data.trustDevice === true) {
            throw new APIError("BAD_REQUEST", {
              code: TRUST_DEVICE_REFUSED,
              message:
                "Device trust is not available for the break-glass account.",
            });
          }
          return;
        }

        const guarded =
          ctx.path === "/change-password" ||
          ctx.path === "/two-factor/enable" ||
          ctx.path === "/two-factor/disable";
        if (!guarded) return;

        const cookieName = ctx.context.authCookies.sessionToken.name;
        const token = await ctx.getSignedCookie(cookieName, ctx.context.secret);
        const found =
          token === false || token === null
            ? null
            : await ctx.context.internalAdapter.findSession(token);
        const person = found?.user;

        // R-63: the two-factor endpoints and the password change are the break-glass account's.
        if (person !== undefined && person.isBreakGlass !== true) {
          throw new APIError("FORBIDDEN", {
            code: BREAK_GLASS_ONLY_CODE,
            message: "This endpoint is for the break-glass account only.",
          });
        }

        // S3: the password checks are limited per account (the R-19 service), so a held
        // break-glass session cannot brute-force the current password at Better Auth.
        if (person !== undefined && person.isBreakGlass === true) {
          const decision = await consumeRateLimit(tenant, {
            endpoint: "break_glass_password",
            subject: person.id,
          });
          if (!decision.allowed) {
            await writeAuthAuditEvent(tenant, {
              action: "auth:rate_limited",
              summary:
                "Break-glass password check refused by the fixed-window rate limit",
              metadata: {
                endpoint: decision.endpoint,
                subjectKind: decision.subjectKind,
                windowMinutes: decision.windowMinutes,
                retryAfterMinutes: decision.retryAfterMinutes,
              },
            });
            return new Response(
              JSON.stringify({
                code: RATE_LIMITED_CODE,
                retryAfterMinutes: decision.retryAfterMinutes,
              }),
              { status: 429, headers: { "content-type": "application/json" } }
            );
          }
        }

        // R-64: the server check is the same rule the client meter reads, plus the save-time
        // clause that the new password is not the provisioning password it replaces.
        if (ctx.path === "/change-password" && person !== undefined) {
          const body = changePasswordBody.safeParse(ctx.body);
          if (
            body.success &&
            !(
              meetsPasswordRule(body.data.newPassword, person.email) &&
              body.data.newPassword !== body.data.currentPassword
            )
          ) {
            throw new APIError("BAD_REQUEST", {
              code: PASSWORD_POLICY_CODE,
              message: "The new password does not meet the password policy.",
            });
          }
        }
        return;
      }),
      after: createAuthMiddleware(async (ctx) => {
        const tenant = input.tenant?.();
        if (tenant === undefined) return;

        // B3: the re-enroll start removes the authenticator; one row records it (R-66). Better
        // Auth runs after-hooks even on an APIError, so a wrong-password disable would otherwise
        // be recorded; the row is written only once the flag is actually false (review N1).
        if (ctx.path === "/two-factor/disable") {
          const person = ctx.context.session?.user;
          if (person === undefined || person.isBreakGlass !== true) return;
          const [owner] = await input.db
            .select({ twoFactorEnabled: user.twoFactorEnabled })
            .from(user)
            .where(eq(user.id, person.id));
          if (owner?.twoFactorEnabled !== false) return;
          await writeAuthAuditEvent(tenant, {
            action: "auth:break_glass_authenticator_cleared",
            actorUserId: person.id,
            targetUserId: person.id,
            summary: "Break-glass authenticator cleared for re-enrollment",
          });
          return;
        }

        if (
          ctx.path !== "/sign-in/email" &&
          ctx.path !== "/two-factor/verify-totp"
        )
          return;
        const created = ctx.context.newSession;

        // The temporary session `/sign-in/email` creates for an enrolled account is not a
        // completed sign-in; the code step completes it. A first sign-in (not enrolled) is.
        if (ctx.path === "/sign-in/email") {
          const person = created?.user;
          if (person === undefined || person.isBreakGlass !== true) return;
          if (person.twoFactorEnabled === true) return;
          await writeAuthAuditEvent(tenant, {
            action: "auth:break_glass_sign_in",
            actorUserId: person.id,
            targetUserId: person.id,
            summary: "Break-glass sign-in",
          });
          return;
        }

        // N2: decide as the plugin does - a live session wins. A sessionless request carrying
        // the two-factor challenge cookie is the code step of a sign-in; a request with a live
        // session (or no challenge) is the enrollment that completes the forced steps. The
        // person therefore comes from the new session or, on the live-session path, the live one.
        const sessionName = ctx.context.authCookies.sessionToken.name;
        const sessionToken = await ctx.getSignedCookie(
          sessionName,
          ctx.context.secret
        );
        const liveSession =
          sessionToken === false || sessionToken === null
            ? null
            : await ctx.context.internalAdapter.findSession(sessionToken);
        const challenge = await ctx.getSignedCookie(
          ctx.context.createAuthCookie(TWO_FACTOR_CHALLENGE_COOKIE).name,
          ctx.context.secret
        );
        const isEnrollment =
          liveSession !== null ||
          challenge === false ||
          challenge === null ||
          challenge === undefined;
        const person = created?.user ?? liveSession?.user;

        if (person === undefined || person.isBreakGlass !== true) return;

        if (!isEnrollment) {
          await writeAuthAuditEvent(tenant, {
            action: "auth:break_glass_sign_in",
            actorUserId: person.id,
            targetUserId: person.id,
            summary: "Break-glass sign-in",
          });
          return;
        }

        // R-65: enrollment completes the forced steps. Keep the session it created (or the live
        // one) and drop the account's other sessions.
        const currentSessionId = created?.session.id ?? liveSession?.session.id;

        if (currentSessionId !== undefined) {
          await input.db
            .delete(session)
            .where(
              and(
                eq(session.userId, person.id),
                ne(session.id, currentSessionId)
              )
            );
        }
        await writeAuthAuditEvent(tenant, {
          action: "auth:break_glass_authenticator_enrolled",
          actorUserId: person.id,
          targetUserId: person.id,
          summary: "Break-glass authenticator enrolled",
        });
      }),
    },
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
      // R-63: the two-factor plugin backs the break-glass account's authenticator. The issuer is
      // the product name the enrollment caller supplies; this is the fallback.
      twoFactorPlugin({ issuer: TOTP_ISSUER_DEFAULT }),
      ...(withKeycloak
        ? [
            genericOAuth({
              config: [keycloakProviderConfig(providerInput(input))],
            }),
          ]
        : []),
    ],
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
      isBreakGlass: value.user.isBreakGlass === true,
      mustChangePassword: value.user.mustChangePassword === true,
      twoFactorEnabled: value.user.twoFactorEnabled === true,
    },
    session: {
      id: value.session.id,
      userId: value.session.userId,
      expiresAt: value.session.expiresAt,
      createdAt: new Date(value.session.createdAt),
      lastActiveAt:
        value.session.lastActiveAt === null ||
        value.session.lastActiveAt === undefined
          ? null
          : new Date(value.session.lastActiveAt),
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
   * What building the full instance answered. `issuer_mismatch` is the second discovery read the
   * `genericOAuth` plugin performs when the instance is built: it verifies id tokens against that
   * read's issuer, so an issuer that differs from `keycloakIssuer` must drop the instance and keep
   * the member not ready, exactly as the probe's own mismatch does (R-54d).
   */
  type FullInstance =
    | { readonly kind: "ready"; readonly instance: BetterAuthInstance }
    | { readonly kind: "issuer_mismatch" }
    | { readonly kind: "unavailable" };

  function logIssuerMismatch(): void {
    input.logger.error(
      {
        keycloakUrl: input.auth.keycloakUrl,
        realm: input.auth.keycloakRealm,
      },
      "keycloak discovery issuer mismatch"
    );
  }

  /**
   * The full instance, or why it was dropped. The plugin reads discovery again with no timeout of
   * its own, so its context is awaited under the same bound as the probe; a read that hangs past it
   * leaves the member degraded and the half-built instance is dropped. The plugin takes `issuer`,
   * `jwks_uri` and the endpoints from that second read, so its `issuer` is compared with the
   * expected one here: the probe's check alone would leave the token verifier unchecked (R-54d).
   */
  async function fullInstance(): Promise<FullInstance> {
    const next = buildInstance(input, true);

    try {
      const context = await withTimeout(next.$context, DISCOVERY_TIMEOUT_MS);

      const provider = context.socialProviders.find(
        (candidate) => candidate.id === KEYCLOAK_PROVIDER_ID
      );

      if (provider === undefined) return { kind: "unavailable" };

      // SAFETY: the genericOAuth plugin writes the issuer from its own discovery read onto the
      // provider record it builds (better-auth generic-oauth sets `issuer` beside `id`).
      const issuer = (provider as { readonly issuer?: string }).issuer;

      return issuer ===
        keycloakIssuer(input.auth.keycloakUrl, input.auth.keycloakRealm)
        ? { kind: "ready", instance: next }
        : { kind: "issuer_mismatch" };
    } catch {
      // ponytail: the dropped instance keeps its untimed plugin discovery fetch open until undici's
      // own timeouts end it (connect 10 s, headers 300 s), one per 10 s retry at most. If that
      // shows in practice, pass the plugin a fetch with an AbortSignal once genericOAuth accepts one.
      return { kind: "unavailable" };
    }
  }

  async function apply(result: DiscoveryResult): Promise<AuthDiscoveryState> {
    if (!result.ready) {
      // R-54d: an issuer mismatch is logged at error level, beside the cause sign-in refuses with.
      if (result.cause === "issuer_mismatch") logIssuerMismatch();

      discovery = result;

      return discovery;
    }

    const built = await fullInstance();

    if (built.kind !== "ready") {
      const cause =
        built.kind === "issuer_mismatch"
          ? "issuer_mismatch"
          : "discovery_unreachable";

      if (cause === "issuer_mismatch") logIssuerMismatch();

      discovery = { ready: false, cause };

      return discovery;
    }

    instance = built.instance;
    endSessionEndpoint = result.endSessionEndpoint;
    discovery = { ready: true };

    return discovery;
  }

  async function ensureDiscovery(): Promise<AuthDiscoveryState> {
    if (discovery.ready) return discovery;

    // A caller during a probe waits for its answer instead of reading the stale state.
    if (inFlight !== undefined) return inFlight;

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

  /**
   * The enforced session read (R-14). Better Auth's own read has already refused the 24 hour cap
   * (`expiresAt`, never extended because refresh is off); this adds the tenant's idle window,
   * read through the settings reader behind its cache, and deletes the row a request finds past
   * the window so the next request - and every parallel one - is unauthenticated too. The last
   * activity baseline is the activity call's column, or the session's creation until the first
   * call writes it.
   */
  async function enforcedSession(headers: Headers): Promise<AuthSessionState> {
    const value = await instance.api.getSession({ headers });

    if (value === null) return { status: "anonymous" };

    const current = toSession(value);

    if (current === null) return { status: "anonymous" };

    const { sessionIdleMinutes } = await input.settings.get();

    const lastActivity =
      current.session.lastActiveAt ?? current.session.createdAt;

    if (
      isIdleExpired({
        lastActivityAt: lastActivity,
        idleMinutes: sessionIdleMinutes,
        now: new Date(now()),
      })
    ) {
      await input.db.delete(session).where(eq(session.id, current.session.id));

      return { status: "idle-expired" };
    }

    return { status: "authenticated", session: current };
  }

  return {
    handler: (request) => instance.handler(request),

    async getSession({ headers }) {
      const state = await enforcedSession(headers);

      return state.status === "authenticated" ? state.session : null;
    },

    sessionState: ({ headers }) => enforcedSession(headers),

    async recordActivity({ headers }) {
      const state = await enforcedSession(headers);

      if (state.status !== "authenticated") return null;

      const at = new Date(now());
      const { sessionIdleMinutes } = await input.settings.get();

      // R-15: this update is the one writer of `last_active_at`.
      await input.db
        .update(session)
        .set({ lastActiveAt: at })
        .where(eq(session.id, state.session.session.id));

      // R-15a: the absolute expiry computed from the activity just recorded.
      return {
        idleExpiresAt: idleExpiry({
          lastActivityAt: at,
          idleMinutes: sessionIdleMinutes,
        }),
      };
    },

    async listOwnSessions({ headers }) {
      const state = await enforcedSession(headers);

      if (state.status !== "authenticated") return null;

      const rows = await input.db
        .select()
        .from(session)
        .where(eq(session.userId, state.session.user.id))
        .orderBy(desc(session.createdAt));

      const { sessionIdleMinutes } = await input.settings.get();
      const at = new Date(now());

      const live = rows.filter(
        (row) =>
          row.expiresAt.getTime() > at.getTime() &&
          !isIdleExpired({
            lastActivityAt: row.lastActiveAt ?? row.createdAt,
            idleMinutes: sessionIdleMinutes,
            now: at,
          })
      );

      const described = live.map((row) => {
        const agent = describeUserAgent(row.userAgent);

        return {
          id: row.id,
          device: agent.device,
          browser: agent.browser,
          ipAddress: row.ipAddress ?? "—",
          signedInAt: row.createdAt,
          lastActiveAt: row.lastActiveAt ?? row.createdAt,
          isCurrent: row.id === state.session.session.id,
        } satisfies AuthOwnSession;
      });

      // The current session is first; the rest newest signed-in first (R-18).
      return described.toSorted((a, b) =>
        a.isCurrent === b.isCurrent
          ? b.signedInAt.getTime() - a.signedInAt.getTime()
          : a.isCurrent
            ? -1
            : 1
      );
    },

    async revokeOwnSession({ headers, sessionId }) {
      const state = await enforcedSession(headers);

      if (state.status !== "authenticated") return "unauthenticated";

      // The current session is refused: the block marks it and offers no revoke (R-18).
      if (sessionId === state.session.session.id) return "current";

      const deleted = await input.db
        .delete(session)
        .where(
          and(
            eq(session.id, sessionId),
            eq(session.userId, state.session.user.id)
          )
        )
        .returning({ id: session.id });

      return deleted.length > 0 ? "revoked" : "not-found";
    },

    async revokeOtherOwnSessions({ headers }) {
      const state = await enforcedSession(headers);

      if (state.status !== "authenticated") return null;

      const deleted = await input.db
        .delete(session)
        .where(
          and(
            eq(session.userId, state.session.user.id),
            ne(session.id, state.session.session.id)
          )
        )
        .returning({ id: session.id });

      return deleted.length;
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
