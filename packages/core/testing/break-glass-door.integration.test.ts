import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { auditEvent, session } from "../src/schema.ts";
import {
  BREAK_GLASS_ONLY_CODE,
  PASSWORD_POLICY_CODE,
  TRUST_DEVICE_REFUSED,
} from "../src/services/auth/index.ts";
import {
  insertCredentialPerson,
  insertSession,
  type DisposableDeployment,
  signedSessionCookie,
  startDisposableDeployment,
  totpCodeForUri,
} from "./index.ts";

/**
 * The break-glass door's full HTTP flow against a real Postgres and the real Better Auth instance
 * (Spec 2 R-62 to R-65, R-44/R-45, and the S2-09 review blockers B1, B2 and L2): enrollment
 * revokes other sessions, the code step is a sign-in and not an enrollment, device trust is
 * refused, a later sign-in still asks for the code, an ordinary session is refused on the
 * break-glass-only endpoints, and the save-time password clause is enforced.
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

const NEW_PASSWORD = "BreakGlass1!xy";

const SESSION_COOKIE = "__Host-genie-session";

// The plugin cookie carries this instance's prefix (`createCookieGetter`, prefix `better-auth`).
const TWO_FACTOR_COOKIE = "better-auth.two_factor";

describe("the break-glass door flow against a real database", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });
    await deployment.context.db.$client.query(
      "insert into tenant_settings default values"
    );
  }, 240_000);

  afterAll(async () => {
    await deployment?.stop();
  });

  beforeEach(async () => {
    await deployment.context.db.$client.query("delete from rate_limit_window");
  });

  function handler(): (request: Request) => Promise<Response> {
    const auth = deployment.context.auth;

    if (auth === undefined)
      throw new Error("the deployment built no auth member");

    return (request) => auth.handler(request);
  }

  /** The small JSON bodies these requests carry: strings and booleans only. */
  type AuthBody = Readonly<Record<string, string | boolean>>;

  function post(
    path: string,
    body: AuthBody,
    cookie?: string
  ): Promise<Response> {
    const headers = new Headers({
      "content-type": "application/json",
      "origin": PUBLIC_URL,
    });

    if (cookie !== undefined) headers.set("cookie", cookie);

    return handler()(
      new Request(`${PUBLIC_URL}/api/auth${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
    );
  }

  function cookiesOf(response: Response) {
    const set = response.headers.getSetCookie();

    const value = (name: string): string | undefined =>
      set.find((entry) => entry.startsWith(`${name}=`))?.split(";")[0];

    return {
      session: value(SESSION_COOKIE),
      twoFactor: value(TWO_FACTOR_COOKIE),
    };
  }

  it("enrollment revokes other sessions, the code step is a sign-in, and trustDevice is refused (B1, B2, R-45)", async () => {
    const email = `door-${Date.now()}@example.invalid`;

    // A second live session before enrollment, so the enrollment's revocation is observable.
    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
      mustChangePassword: false,
      twoFactorEnabled: false,
    });

    const otherToken = await insertSession(deployment.context, { userId });

    const signedIn = await post("/sign-in/email", {
      email,
      password: PASSWORD,
    });

    const sessionCookie = cookiesOf(signedIn).session ?? "";

    const enabled = await post(
      "/two-factor/enable",
      { password: PASSWORD, method: "totp" },
      sessionCookie
    );

    // SAFETY: Better Auth's enable answer carries `totpURI` as a string.
    const totpURI = ((await enabled.json()) as { readonly totpURI: string })
      .totpURI;

    const enrolled = await post(
      "/two-factor/verify-totp",
      { code: totpCodeForUri(totpURI) },
      sessionCookie
    );

    expect(enrolled.status).toBe(200);

    // R-65: the enrollment deletes the account's other sessions.
    const otherStillThere = await deployment.context.db
      .select()
      .from(session)
      .where(eq(session.token, otherToken));

    expect(otherStillThere).toHaveLength(0);

    // Enrollment wrote exactly one `authenticator_enrolled` row.
    const enrolledRows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.actorUserId, userId),
          eq(auditEvent.action, "auth:break_glass_authenticator_enrolled")
        )
      );

    expect(enrolledRows).toHaveLength(1);

    // A second live session after enrollment, to prove the code-step sign-in does not revoke.
    const survivor = await insertSession(deployment.context, { userId });

    // Sign in again: the account is enrolled, so Better Auth answers a challenge, not a session.
    const challenged = await post("/sign-in/email", {
      email,
      password: PASSWORD,
    });

    // SAFETY: Better Auth's sign-in answer carries `twoFactorRedirect: true` while a challenge
    // is pending; the assertion names only that field.
    const challengeBody = (await challenged.json()) as {
      readonly twoFactorRedirect?: boolean;
    };

    expect(challengeBody.twoFactorRedirect).toBe(true);

    const challengeCookie = cookiesOf(challenged).twoFactor;

    expect(challengeCookie).toBeDefined();

    // B1: a trustDevice code is refused and sets no trust cookie.
    const trusted = await post(
      "/two-factor/verify-totp",
      { code: totpCodeForUri(totpURI), trustDevice: true },
      challengeCookie
    );

    expect(trusted.status).toBe(400);
    expect(await trusted.json()).toMatchObject({ code: TRUST_DEVICE_REFUSED });
    expect(
      trusted.headers
        .getSetCookie()
        .some((entry) => entry.startsWith("trust_device="))
    ).toBe(false);

    // The same challenge still completes without trustDevice: a code-step sign-in.
    const completed = await post(
      "/two-factor/verify-totp",
      { code: totpCodeForUri(totpURI) },
      challengeCookie
    );

    expect(completed.status).toBe(200);
    expect(cookiesOf(completed).session).toBeDefined();

    // B2: it is recorded as a sign-in, and the survivor session is untouched.
    const signInRows = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.actorUserId, userId),
          eq(auditEvent.action, "auth:break_glass_sign_in")
        )
      );

    // Two sign-ins: the first (not enrolled) and this code step. The code step added a sign-in
    // row, not a second enrollment row (B2).
    expect(signInRows).toHaveLength(2);

    const enrolledRowsAfter = await deployment.context.db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.actorUserId, userId),
          eq(auditEvent.action, "auth:break_glass_authenticator_enrolled")
        )
      );

    expect(enrolledRowsAfter).toHaveLength(1);

    const survivorStillThere = await deployment.context.db
      .select()
      .from(session)
      .where(eq(session.token, survivor));

    expect(survivorStillThere).toHaveLength(1);

    // And a later sign-in still asks for the code (no trust cookie was minted).
    const again = await post("/sign-in/email", { email, password: PASSWORD });

    // SAFETY: Better Auth's sign-in answer carries `twoFactorRedirect: true` while a challenge
    // is pending; the assertion names only that field.
    const againBody = (await again.json()) as {
      readonly twoFactorRedirect?: boolean;
    };

    expect(againBody.twoFactorRedirect).toBe(true);
  });

  it("refuses an ordinary session on the break-glass-only endpoints (L2)", async () => {
    const email = `ordinary-${Date.now()}@example.invalid`;

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
      isBreakGlass: false,
    });

    const token = await insertSession(deployment.context, { userId });

    const cookie = await signedSessionCookie({
      token,
      secret: AUTH_ENV.BETTER_AUTH_SECRET,
      name: SESSION_COOKIE,
    });

    for (const [path, body] of [
      [
        "/change-password",
        { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      ],
      ["/two-factor/enable", { password: PASSWORD, method: "totp" }],
      ["/two-factor/disable", { password: PASSWORD }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each endpoint is one request
      const response = await post(path, body, cookie);

      expect(response.status, path).toBe(403);
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json(), path).toMatchObject({
        code: BREAK_GLASS_ONLY_CODE,
      });
    }
  });

  it("refuses a new password equal to the provisioning one (R-64, L2)", async () => {
    const email = `provision-${Date.now()}@example.invalid`;

    await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
      mustChangePassword: true,
      twoFactorEnabled: false,
    });

    const signedIn = await post("/sign-in/email", {
      email,
      password: PASSWORD,
    });

    expect(signedIn.status).toBe(200);

    const cookie = cookiesOf(signedIn).session;

    // The save-time clause refuses a "new" password equal to the provisioning one, before
    // Better Auth's own check.
    const response = await post(
      "/change-password",
      { currentPassword: PASSWORD, newPassword: PASSWORD },
      cookie
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: PASSWORD_POLICY_CODE });
  });
});
