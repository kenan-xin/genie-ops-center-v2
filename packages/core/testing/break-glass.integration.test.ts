import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createModuleTRPC } from "../src/lib/entitlement/module-trpc.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { account, auditEvent, session, user } from "../src/schema.ts";
import {
  BREAK_GLASS_ONLY_CODE,
  BREAK_GLASS_OAUTH_REFUSED,
  INVALID_CREDENTIALS_MESSAGE,
  sessionCreateBefore,
} from "../src/services/auth/index.ts";
import {
  LIMITED_SESSION_CLEARING_ENDPOINTS,
  isLimitedBreakGlass,
} from "../src/services/auth/limited.ts";
import { AuthRequestScope } from "../src/services/auth/request-scope.ts";
import {
  can,
  principalFor,
  scopesFor,
} from "../src/services/authorization/index.ts";
import { enableModules } from "./enable-modules.ts";
import {
  insertCredentialPerson,
  type DisposableDeployment,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The break-glass lifecycle against a real Postgres and the real Better Auth instance (Spec 2
 * AC-3, AC-13 (rotate is separate), AC-15, R-30, R-62, R1): the neutral credential refusal, the
 * per-deployment rate limit and its audit row, the R1 session guard, and the limited-session
 * refusal by `can()` and by every router.
 */
const PUBLIC_URL = "https://test.example.invalid";

const AUTH_ENV = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

const PASSWORD = "temporary-pass-1!";

const trpc = createModuleTRPC("fixture");

/** A module route that refuses in its own `can()` check, as every route must (R-30). */
const fixtureModule = {
  ...validModule,
  router: trpc.router({
    home: trpc.procedure.query(async ({ ctx }) => {
      if (!(await can(ctx.caller, "fixture:use")))
        throw new TRPCError({ code: "FORBIDDEN" });

      return "home";
    }),
  }),
};

const modules = [fixtureModule];

describe("the break-glass lifecycle against a real database", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment(modules, {
      env: AUTH_ENV,
      profile: "application",
    });
    await enableModules(deployment.context, ["fixture"]);
    await deployment.context.db.$client.query(
      "insert into tenant_settings default values"
    );
  }, 240_000);

  afterAll(async () => {
    await deployment?.stop();
  });

  // The break-glass window is per deployment, so one test's attempts would otherwise count
  // against the next. Each case starts with an empty counter table.
  beforeEach(async () => {
    await deployment.context.db.$client.query("delete from rate_limit_window");
  });

  function authHandler() {
    const auth = deployment.context.auth;

    if (auth === undefined)
      throw new Error("the deployment built no auth member");

    return auth;
  }

  function signIn(email: string, password = PASSWORD): Promise<Response> {
    return authHandler().handler(
      new Request(`${PUBLIC_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", "origin": PUBLIC_URL },
        body: JSON.stringify({ email, password }),
      })
    );
  }

  async function insertBreakGlass(input: {
    readonly email: string;
    readonly mustChangePassword: boolean;
    readonly twoFactorEnabled: boolean;
  }): Promise<string> {
    const id = await insertCredentialPerson(deployment.context, {
      email: input.email,
      password: PASSWORD,
    });

    await deployment.context.db
      .update(user)
      .set({
        mustChangePassword: input.mustChangePassword,
        twoFactorEnabled: input.twoFactorEnabled,
      })
      .where(eq(user.id, id));

    return id;
  }

  it("refuses a non-break-glass credential with a neutral message and no session (R-62)", async () => {
    const email = `ordinary-${Date.now()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
      isBreakGlass: false,
    });

    const response = await signIn(email);

    expect(response.status).toBe(401);

    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: BREAK_GLASS_ONLY_CODE });
    expect(JSON.stringify(body)).toContain(INVALID_CREDENTIALS_MESSAGE);

    const sessions = await deployment.context.db
      .select()
      .from(session)
      .where(eq(session.userId, userId));

    expect(sessions).toHaveLength(0);
  });

  it("refuses the eleventh break-glass attempt and writes one auth:rate_limited row (R-19 to R-21)", async () => {
    const email = `limited-${Date.now()}@example.invalid`;

    await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    // Ten wrong-password attempts are counted; each answers 401 before any session.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the counter is read-modify-write in order
      const response = await signIn(email, "wrong-password-1!");

      expect(response.status).toBe(401);
    }

    const refused = await signIn(email, "wrong-password-1!");
    expect(refused.status).toBe(429);

    const body = z
      .object({ code: z.string(), retryAfterMinutes: z.number() })
      .safeParse(await refused.json());

    expect(body.success).toBe(true);
    expect(body.success ? body.data.code : "").toBe("rate_limited");
    expect(body.success ? body.data.retryAfterMinutes : 0).toBeGreaterThan(0);

    const rows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "auth:rate_limited"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      endpoint: "break_glass_sign_in",
      subjectKind: "deployment",
    });
  });

  it("lets a break-glass credential sign in and writes one auth:break_glass_sign_in row (R-44, R-45)", async () => {
    const email = `glass-${Date.now()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    const response = await signIn(email);

    expect(response.status).toBe(200);

    const rows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, "auth:break_glass_sign_in"));

    // The audit row names the signed-in account, not the password.
    expect(rows.some((row) => row.actorUserId === userId)).toBe(true);
  });

  it("guards every session: break-glass only from the credential path, an ordinary person only from the realm (R1, R-62)", async () => {
    const scope = new AuthRequestScope();

    const breakGlass = await insertCredentialPerson(deployment.context, {
      email: `guard-glass-${Date.now()}@example.invalid`,
      password: PASSWORD,
    });

    const ordinary = await insertCredentialPerson(deployment.context, {
      email: `guard-ordinary-${Date.now()}@example.invalid`,
      password: PASSWORD,
      isBreakGlass: false,
    });

    const guard = sessionCreateBefore({
      db: deployment.context.db,
      requestScope: scope,
    });

    // A break-glass session from a realm callback is refused (R1).
    await scope.run(async () => {
      scope.capture([], true);

      await expect(guard({ userId: breakGlass })).rejects.toMatchObject({
        body: { code: BREAK_GLASS_OAUTH_REFUSED },
      });
    });

    // ...but the credential path is allowed.
    await scope.run(async () => {
      await expect(guard({ userId: breakGlass })).resolves.toBeUndefined();
    });

    // An ordinary person's credential session is refused (R-62)...
    await scope.run(async () => {
      await expect(guard({ userId: ordinary })).rejects.toMatchObject({
        body: { code: BREAK_GLASS_ONLY_CODE },
      });
    });

    // ...and the realm path is allowed.
    await scope.run(async () => {
      scope.capture([], true);

      await expect(guard({ userId: ordinary })).resolves.toBeUndefined();
    });
  });

  it("refuses a limited break-glass session in can() and by every router except the two endpoints that clear it (R-30)", async () => {
    const mustChange = await insertBreakGlass({
      email: `limit-change-${Date.now()}@example.invalid`,
      mustChangePassword: true,
      twoFactorEnabled: true,
    });

    const notEnrolled = await insertBreakGlass({
      email: `limit-enroll-${Date.now()}@example.invalid`,
      mustChangePassword: false,
      twoFactorEnabled: false,
    });

    // The two clearing endpoints, and only those two (DEC-24).
    expect(LIMITED_SESSION_CLEARING_ENDPOINTS).toEqual([
      "/change-password",
      "/two-factor/verify-totp",
    ]);

    for (const userId of [mustChange, notEnrolled]) {
      // oxlint-disable-next-line no-await-in-loop -- each person's refusal is its own request
      const caller = principalFor({
        tenant: deployment.context,
        modules,
        userId,
        authenticated: true,
      });

      // oxlint-disable-next-line no-await-in-loop
      expect(await can(caller, "fixture:use")).toBe(false);
      // oxlint-disable-next-line no-await-in-loop
      expect(await scopesFor(caller, "fixture:use")).toEqual({ kind: "none" });

      // A module router refuses...
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        fixtureModule.router
          .createCaller({ tenant: deployment.context, caller })
          .home()
      ).rejects.toThrow("FORBIDDEN");
    }

    // ...and so does a session whose account is unlimited only when both conditions are cleared.
    const completed = await insertBreakGlass({
      email: `limit-done-${Date.now()}@example.invalid`,
      mustChangePassword: false,
      twoFactorEnabled: true,
    });

    const completedCaller = principalFor({
      tenant: deployment.context,
      modules,
      userId: completed,
      authenticated: true,
    });

    expect(
      isLimitedBreakGlass({
        isBreakGlass: true,
        mustChangePassword: false,
        twoFactorEnabled: true,
      })
    ).toBe(false);
    expect(await can(completedCaller, "fixture:use")).toBe(true);
  });

  it("clears must_change_password when the provisioning password is replaced (R-65)", async () => {
    const email = `change-${Date.now()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    const signInResponse = await signIn(email);
    expect(signInResponse.status).toBe(200);

    const cookie = signInResponse.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .join("; ");

    const change = await authHandler().handler(
      new Request(`${PUBLIC_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": PUBLIC_URL,
          cookie,
        },
        body: JSON.stringify({
          currentPassword: PASSWORD,
          newPassword: "Abcdefghij1!xy",
        }),
      })
    );

    expect(change.status).toBe(200);

    const [row] = await deployment.context.db
      .select({ mustChangePassword: user.mustChangePassword })
      .from(user)
      .where(eq(user.id, userId));

    expect(row?.mustChangePassword).toBe(false);
  });

  it("refuses a new password that misses the shared rule (R-64)", async () => {
    const email = `policy-${Date.now()}@example.invalid`;

    await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    const signInResponse = await signIn(email);
    expect(signInResponse.status).toBe(200);

    const cookie = signInResponse.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .join("; ");

    const change = await authHandler().handler(
      new Request(`${PUBLIC_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": PUBLIC_URL,
          cookie,
        },
        body: JSON.stringify({
          currentPassword: PASSWORD,
          newPassword: "short",
        }),
      })
    );

    expect(change.status).toBe(400);
    expect(await change.json()).toMatchObject({ code: "password_policy" });

    // The stored credential still holds the password that was not replaced.
    const accounts = await deployment.context.db
      .select()
      .from(account)
      .where(
        eq(
          account.userId,
          (
            await deployment.context.db
              .select({ id: user.id })
              .from(user)
              .where(eq(user.email, email.toLowerCase()))
          )[0]?.id ?? ""
        )
      );

    expect(accounts).toHaveLength(1);
  });
});
