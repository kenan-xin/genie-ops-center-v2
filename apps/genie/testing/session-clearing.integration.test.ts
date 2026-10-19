import {
  insertCredentialPerson,
  insertSession,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_AUTH_ENV } from "./auth-env.ts";
import { imageHostPort } from "./image-ports.ts";
import { startBuiltApp } from "./start-built-app.ts";

/**
 * R-14 as amended on 2026-10-19: a read refuses an idle session and keeps its row, so every
 * request of the browser agrees (genie-ops-center-v2-lqns), and the row is deleted where the
 * application clears the browser's cookie. The three routes that clear it are driven over the
 * real built server: the session-expired route, the idle branch of sign-out (R-17), and the
 * refused activity call. Each deletes only a row that is still idle, never a live one.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

/** The built server's public URL is `https://example.invalid`; state changes must name it. */
const ORIGIN = "https://example.invalid";

const SESSION_COOKIE = "__Host-genie-session";

const IDLE_MINUTES = 15;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3416)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

/** One person with one session whose last activity is `minutesAgo` back, and its cookie. */
async function sessionFor(
  label: string,
  minutesAgo: number
): Promise<{ readonly cookie: string; readonly token: string }> {
  const userId = await insertCredentialPerson(deployment.context, {
    email: `${label}-${Date.now()}@example.invalid`,
    password: "session-clearing-password-14",
    isBreakGlass: false,
  });

  const token = await insertSession(deployment.context, {
    userId,
    lastActiveAt: new Date(Date.now() - minutesAgo * 60_000),
  });

  const cookie = await signedSessionCookie({
    token,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: SESSION_COOKIE,
  });

  return { cookie, token };
}

async function rowCount(token: string): Promise<number> {
  const result = await deployment.context.db.$client.query<{
    readonly count: number;
  }>("select count(*)::int as count from session where token = $1", [token]);

  return result.rows[0]?.count ?? 0;
}

const ROUTES = [
  {
    name: "the session-expired route",
    send: (cookie: string) =>
      fetch(`${server.baseUrl}/api/auth/session-expired`, {
        headers: { cookie },
        redirect: "manual",
      }),
  },
  {
    name: "the idle branch of sign-out (R-17)",
    send: (cookie: string) =>
      fetch(`${server.baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
        redirect: "manual",
      }),
  },
  {
    name: "the refused activity call",
    send: (cookie: string) =>
      fetch(`${server.baseUrl}/api/session/activity`, {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
        redirect: "manual",
      }),
  },
] as const;

describe("the routes that clear an idle session's cookie", () => {
  it.each(ROUTES)(
    "$name deletes the idle row with the cookie",
    async (route) => {
      const { cookie, token } = await sessionFor("idle", IDLE_MINUTES + 1);

      // A read before the clearing keeps the row: every racing request answers idle-expired.
      expect(await rowCount(token)).toBe(1);

      const response = await route.send(cookie);

      expect(response.headers.getSetCookie().join("\n")).toMatch(
        new RegExp(`${SESSION_COOKIE}=;`)
      );
      expect(await rowCount(token)).toBe(0);
    }
  );

  it("no route deletes a live session", async () => {
    const { cookie, token } = await sessionFor("live", 1);

    // The session-expired route sends a live session home; the activity call slides it. Neither
    // may remove it.
    const routes = ROUTES.filter((route) => !route.name.includes("sign-out"));

    await Promise.all(routes.map((route) => route.send(cookie)));

    expect(await rowCount(token)).toBe(1);
  });
});
