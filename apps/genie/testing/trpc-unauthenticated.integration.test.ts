import { CORE_ERROR_MESSAGES } from "@genie/core";
import {
  enableModules,
  insertCredentialPerson,
  insertSession,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_AUTH_ENV } from "./auth-env.ts";
import { imageHostPort } from "./image-ports.ts";
import { startBuiltApp } from "./start-built-app.ts";

/**
 * The unauthenticated tRPC answer over the real transport (Spec 2 R-14, R-46). A request with no
 * valid session is refused `unauthenticated` at 401 whichever way its session went - never signed
 * in, idle-expired, or past the absolute cap - while a signed-in person without the grant stays
 * `forbidden` at 403. The procedure's own `can()` is unchanged: it still holds no grant for an
 * anonymous caller.
 */

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

const baseUrl = () => server.baseUrl;

const readUrl = () =>
  `${baseUrl()}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`;

/** One `audit.list` request whose cursor fails the procedure's own input schema. */
const invalidAuditCursorUrl = () =>
  `${baseUrl()}/api/trpc/audit.list?input=${encodeURIComponent(
    JSON.stringify({ cursor: { occurredAt: "not-a-time", id: "not-a-uuid" } })
  )}`;

type ErrorEnvelope = {
  readonly error?: {
    readonly message?: string;
    readonly data?: {
      readonly code?: string;
      readonly httpStatus?: number;
      readonly appCode?: string;
      readonly requestId?: string;
    };
  };
};

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["placeholder"]);

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3412)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

/** The application's cookie name over its HTTPS public URL (R-4a, `sessionCookieName`). */
const SESSION_COOKIE = "__Host-genie-session";

/**
 * A real session for one person, written directly and signed the way Better Auth does. R-62 lets
 * only the break-glass account sign in with a password, so an ordinary person's session is minted
 * here; the session row, the enforced reads and the evaluator stay real.
 */
async function cookieFor(userId: string, expiresAt?: Date): Promise<string> {
  const token = await insertSession(
    deployment.context,
    expiresAt === undefined ? { userId } : { userId, expiresAt }
  );

  return signedSessionCookie({
    token,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: SESSION_COOKIE,
  });
}

async function readAnswer(cookie?: string): Promise<{
  status: number;
  body: ErrorEnvelope;
}> {
  const response = await fetch(
    readUrl(),
    cookie === undefined ? undefined : { headers: { cookie } }
  );

  return {
    status: response.status,
    // SAFETY: the body is the tRPC error envelope this route wrote, and the assertions below
    // check the fields this type reads.
    body: (await response.json()) as ErrorEnvelope,
  };
}

describe("the tRPC answer for an unauthenticated request", () => {
  it("answers an anonymous request unauthenticated at 401", async () => {
    const answer = await readAnswer();

    expect(answer.status).toBe(401);
    expect(answer.body.error?.data?.httpStatus).toBe(401);
    expect(answer.body.error?.data?.code).toBe("UNAUTHORIZED");
    expect(answer.body.error?.data?.appCode).toBe("unauthenticated");
    expect(answer.body.error?.message).toBe(
      CORE_ERROR_MESSAGES.unauthenticated
    );
    expect(answer.body.error?.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers a signed-in person without the permission forbidden at 403", async () => {
    const email = "trpc-no-grant@example.com";

    // A real person holding no key of the module: the refusal is their missing permission, not
    // their session, so it stays forbidden.
    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-no-grant-password-14",
      isBreakGlass: false,
    });

    const cookie = await cookieFor(userId);

    const answer = await readAnswer(cookie);

    expect(answer.status).toBe(403);
    expect(answer.body.error?.data?.httpStatus).toBe(403);
    expect(answer.body.error?.data?.appCode).toBe("forbidden");
    expect(answer.body.error?.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("answers an idle-expired session unauthenticated at 401", async () => {
    const email = "trpc-idle@example.com";

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-idle-password-14",
      isBreakGlass: false,
      permissions: ["placeholder:read"],
    });

    const cookie = await cookieFor(userId);

    // Positive control: inside the window the same cookie reads the module.
    const before = await readAnswer(cookie);

    expect(before.status).toBe(200);

    await deployment.context.db.$client.query(
      "update session set last_active_at = now() - interval '16 minutes' where user_id = (select id from \"user\" where email = $1)",
      [email]
    );

    const answer = await readAnswer(cookie);

    expect(answer.status).toBe(401);
    expect(answer.body.error?.data?.appCode).toBe("unauthenticated");

    // The enforced idle read deleted the row, so a second call is anonymous too.
    await expect
      .poll(
        async () =>
          (
            await deployment.context.db.$client.query<{ count: number }>(
              'select count(*)::int as count from session where user_id = (select id from "user" where email = $1)',
              [email]
            )
          ).rows[0]?.count,
        { timeout: 10_000 }
      )
      .toBe(0);
  });

  it("answers an anonymous request with an invalid audit cursor unauthenticated, not invalid-input", async () => {
    // The session check runs before `.input()` parses, so an anonymous caller cannot learn the
    // input was malformed (Spec 2 R-14); without it this is a 400 BAD_REQUEST.
    const response = await fetch(invalidAuditCursorUrl());

    expect(response.status).toBe(401);

    // SAFETY: the body is the tRPC error envelope this route wrote, and the assertion reads the
    // one field this test checks.
    const body = (await response.json()) as ErrorEnvelope;

    expect(body.error?.data?.appCode).toBe("unauthenticated");
  });

  it("answers an expired session with an invalid audit cursor unauthenticated, not invalid-input", async () => {
    const email = "trpc-audit-cursor@example.com";

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-audit-cursor-password-14",
      isBreakGlass: false,
      permissions: ["core:audit:read"],
    });

    const cookie = await cookieFor(userId);

    // Positive control: a live session reaches the parser, so the bad cursor is invalid input.
    const invalidBefore = await fetch(invalidAuditCursorUrl(), {
      headers: { cookie },
    });

    expect(invalidBefore.status).toBe(400);

    await deployment.context.db.$client.query(
      "update session set last_active_at = now() - interval '16 minutes' where user_id = (select id from \"user\" where email = $1)",
      [email]
    );

    const invalidAfter = await fetch(invalidAuditCursorUrl(), {
      headers: { cookie },
    });

    expect(invalidAfter.status).toBe(401);

    // SAFETY: the body is the tRPC error envelope this route wrote, and the assertion reads the
    // one field this test checks.
    const body = (await invalidAfter.json()) as ErrorEnvelope;

    expect(body.error?.data?.appCode).toBe("unauthenticated");
  });

  it("answers a session past its absolute cap unauthenticated at 401", async () => {
    const email = "trpc-capped@example.com";

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-capped-password-14",
      isBreakGlass: false,
      permissions: ["placeholder:read"],
    });

    // Better Auth refuses an expired row before the idle rule, so the request is anonymous.
    const cookie = await cookieFor(userId, new Date(Date.now() - 60_000));

    const answer = await readAnswer(cookie);

    expect(answer.status).toBe(401);
    expect(answer.body.error?.data?.code).toBe("UNAUTHORIZED");
    expect(answer.body.error?.data?.appCode).toBe("unauthenticated");
  });

  it("refuses a limited break-glass session on every app-owned route except the two clearing endpoints (R-30, S2)", async () => {
    const email = "trpc-limited@example.com";

    // A limited break-glass account: the forced password change is outstanding.
    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-limited-password-14",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });

    const cookie = await cookieFor(userId);

    // The two clearance checks this file exercises below need the module enabled; every route
    // refuses the limited session, so the tRPC answers are `forbidden`, not a success.
    await enableModules(deployment.context, ["placeholder"]);

    const moduleRead = await fetch(readUrl(), { headers: { cookie } });

    expect(moduleRead.status).toBe(403);

    // A well-formed audit read reaches the resolver and `can()` refuses the limited session; a
    // malformed cursor would be a 400 before the permission check.
    const auditRead = await fetch(
      `${baseUrl()}/api/trpc/audit.list?input=${encodeURIComponent("{}")}`,
      { headers: { cookie } }
    );

    expect(auditRead.status).toBe(403);

    for (const [path, body] of [
      ["/api/session/revoke", { sessionId: "whatever" }],
      ["/api/session/revoke-others", { allOthers: true }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each route is one request
      const response = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          "origin": "https://example.invalid",
        },
        body: JSON.stringify(body),
      });

      expect(response.status, path).toBe(403);
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json(), path).toMatchObject({
        code: "limited-session",
      });
    }

    // The two clearing endpoints answer: `/change-password` runs its rule and then Better Auth
    // rejects the wrong current password (400), rather than the limited-session refusal.
    const change = await fetch(`${baseUrl()}/api/auth/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        currentPassword: "wrong-password-1!",
        newPassword: "BreakGlass1!xy",
      }),
    });

    expect(change.status).not.toBe(403);
    expect(change.status).toBe(400);
  });
});
