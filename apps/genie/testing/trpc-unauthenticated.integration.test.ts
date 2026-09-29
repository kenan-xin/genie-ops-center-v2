import { CORE_ERROR_MESSAGES } from "@genie/core";
import {
  enableModules,
  insertCredentialPerson,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const SIGN_IN_ATTEMPTS = 4;

/**
 * Signs one credential person in through the app's own auth and answers the session cookie.
 *
 * Break-glass sign-in is rate limited (R-19): Better Auth answers three `POST /sign-in/email`
 * calls per ten seconds from one address, and this file signs in several people from the one test
 * address. A 429 names its delay in `X-Retry-After`, so the helper waits the window out rather
 * than failing the case.
 */
async function signIn(email: string, password: string): Promise<string> {
  /* eslint-disable no-await-in-loop -- a rate-limited sign-in is retried after the window it names. */
  for (let attempt = 0; attempt < SIGN_IN_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${baseUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://example.invalid",
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("x-retry-after") ?? "10");

      await new Promise((resolve) =>
        setTimeout(resolve, (retryAfter + 1) * 1000)
      );

      continue;
    }

    expect(response.status, await response.clone().text()).toBe(200);

    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .join("; ");

    expect(cookie.length).toBeGreaterThan(0);

    return cookie;
  }
  /* eslint-enable no-await-in-loop */

  throw new Error("the sign-in stayed rate limited past every attempt");
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
    await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-no-grant-password-14",
      isBreakGlass: false,
    });

    const cookie = await signIn(email, "trpc-no-grant-password-14");

    const answer = await readAnswer(cookie);

    expect(answer.status).toBe(403);
    expect(answer.body.error?.data?.httpStatus).toBe(403);
    expect(answer.body.error?.data?.appCode).toBe("forbidden");
    expect(answer.body.error?.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("answers an idle-expired session unauthenticated at 401", async () => {
    const email = "trpc-idle@example.com";

    await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-idle-password-14",
      isBreakGlass: false,
      permissions: ["placeholder:read"],
    });

    const cookie = await signIn(email, "trpc-idle-password-14");

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

    await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-audit-cursor-password-14",
      isBreakGlass: false,
      permissions: ["core:audit:read"],
    });

    const cookie = await signIn(email, "trpc-audit-cursor-password-14");

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

    await insertCredentialPerson(deployment.context, {
      email,
      password: "trpc-capped-password-14",
      isBreakGlass: false,
      permissions: ["placeholder:read"],
    });

    const cookie = await signIn(email, "trpc-capped-password-14");

    // Better Auth refuses an expired row before the idle rule, so the request is anonymous.
    await deployment.context.db.$client.query(
      "update session set expires_at = now() - interval '1 minute' where user_id = (select id from \"user\" where email = $1)",
      [email]
    );

    const answer = await readAnswer(cookie);

    expect(answer.status).toBe(401);
    expect(answer.body.error?.data?.code).toBe("UNAUTHORIZED");
    expect(answer.body.error?.data?.appCode).toBe("unauthenticated");
  });
});
