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
 *
 * The same built server also proves that a state change from another origin is refused, and that
 * the Better Auth catch-all answers 404 outside its allowlist (Spec 2 R-6, R-7).
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

/** Where a redirect sends the browser, as path and query, or null when the answer is not one. */
function landing(response: Response): string | null {
  const location = response.headers.get("location");

  if (location === null) return null;

  const url = new URL(location, ORIGIN);

  return `${url.origin}${url.pathname}${url.search}`;
}

const EXPIRED_BANNER = `${ORIGIN}/sign-in?error=session_expired`;

const ROUTES = [
  {
    name: "the session-expired route",
    // R-17a: the expired banner, never the realm.
    idleLanding: EXPIRED_BANNER,
    send: (cookie: string) =>
      fetch(`${server.baseUrl}/api/auth/session-expired`, {
        headers: { cookie },
        redirect: "manual",
      }),
  },
  {
    name: "the idle branch of sign-out (R-17)",
    // An idle session ends here without a Keycloak redirect.
    idleLanding: EXPIRED_BANNER,
    send: (cookie: string) =>
      fetch(`${server.baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
        redirect: "manual",
      }),
  },
  {
    name: "the refused activity call",
    idleLanding: null,
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
      expect(landing(response)).toBe(route.idleLanding);
      expect(await rowCount(token)).toBe(0);
    }
  );

  it("no route deletes a live session", async () => {
    const { cookie, token } = await sessionFor("live", 1);

    // The session-expired route sends a live session home with its cookie untouched, so another
    // site's link there cannot sign a browser out (genie-ops-center-v2-1rr0); the activity call
    // slides it. Neither may remove it.
    const [expired, , activity] = ROUTES;

    const [home, slid] = await Promise.all([
      expired.send(cookie),
      activity.send(cookie),
    ]);

    expect(landing(home)).toBe(`${ORIGIN}/`);
    expect(home.headers.getSetCookie()).toEqual([]);
    expect(slid.status).toBe(200);
    expect(await rowCount(token)).toBe(1);
  });
});

/** The session row's last activity, to prove a refused request did not slide it. */
async function lastActive(token: string): Promise<string | undefined> {
  const result = await deployment.context.db.$client.query<{
    readonly at: string;
  }>("select last_active_at::text as at from session where token = $1", [
    token,
  ]);

  return result.rows[0]?.at;
}

describe("a state change from another origin", () => {
  it.each(["/api/session/activity", "/api/session/revoke-others"])(
    "%s refuses it without sliding or revoking a session",
    async (path) => {
      const { cookie, token } = await sessionFor("foreign", 1);
      const other = await sessionFor("foreign-other", 1);
      const before = await lastActive(token);

      const response = await fetch(`${server.baseUrl}${path}`, {
        method: "POST",
        headers: { cookie, origin: "https://evil.example.test" },
        redirect: "manual",
      });

      expect(response.status).toBe(403);
      expect(await lastActive(token)).toBe(before);
      expect(await rowCount(other.token)).toBe(1);

      // Control: the same request from the public origin is served.
      const own = await fetch(`${server.baseUrl}${path}`, {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
        redirect: "manual",
      });

      expect(own.status).toBe(200);
    }
  );
});

describe("the Better Auth catch-all on the built server (R-6, R-7)", () => {
  it("refuses an id token sign-in, and the token and linking endpoints with a live session, as 404", async () => {
    const social = await fetch(`${server.baseUrl}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", "origin": ORIGIN },
      body: JSON.stringify({
        provider: "keycloak",
        idToken: { token: "a.b.c" },
      }),
      redirect: "manual",
    });

    expect(social.status).toBe(404);
    expect(social.headers.getSetCookie()).toEqual([]);

    const { cookie } = await sessionFor("catch-all", 1);

    // Control: the cookie names a live session the catch-all serves.
    const session = await fetch(`${server.baseUrl}/api/auth/get-session`, {
      headers: { cookie },
    });

    expect(session.status).toBe(200);
    expect(await session.json()).not.toBeNull();

    const answers = await Promise.all(
      [
        "get-access-token",
        "refresh-token",
        "account-info",
        "link-social",
        "unlink-account",
        "list-accounts",
      ].flatMap((path) => {
        const url = `${server.baseUrl}/api/auth/${path}`;

        return [
          fetch(url, { headers: { cookie }, redirect: "manual" }).then(
            (response) => `GET ${path} ${response.status}`
          ),
          fetch(url, {
            method: "POST",
            headers: {
              cookie,
              "origin": ORIGIN,
              "content-type": "application/json",
            },
            body: JSON.stringify({ providerId: "keycloak" }),
            redirect: "manual",
          }).then((response) => `POST ${path} ${response.status}`),
        ];
      })
    );

    for (const answer of answers) expect(answer).toMatch(/ 404$/);
  });
});
