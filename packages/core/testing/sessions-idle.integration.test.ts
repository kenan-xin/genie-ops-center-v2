import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sessionCookieName } from "../src/services/auth/config.ts";
import type { AuthMember, AuthSession } from "../src/services/auth/index.ts";
import {
  createAuthMember,
  sessionCreateAfter,
} from "../src/services/auth/index.ts";
import { AuthRequestScope } from "../src/services/auth/request-scope.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  insertCredentialPerson,
  insertSession,
  signedSessionCookie,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The idle rule and the Sessions block's member reads (Spec 2 R-14, R-15, R-15a, R-18, AC-5)
 * against a real Postgres with the real core history: the refusal at the idle window, the 24
 * hour cap, the activity call as the one writer of `last_active_at`, ordinary traffic that
 * never slides, and the list that still answers for a session older than a day.
 */
const PUBLIC_URL = "https://test.example.invalid";

const AUTH_ENV = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

const PASSWORD = "break-glass-password-14";

const SESSION_COOKIE = sessionCookieName(PUBLIC_URL);

/** The tenant's idle window for this suite; the settings row is seeded with it below. */
const IDLE_MINUTES = 15;

function authOf(deployment: DisposableDeployment): AuthMember {
  const auth = deployment.context.auth;

  if (auth === undefined)
    throw new Error("the deployment built no auth member");

  return auth;
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}

async function signIn(
  auth: AuthMember,
  email: string
): Promise<{ readonly cookie: string; readonly sessionId: string }> {
  const response = await auth.handler(
    new Request(`${PUBLIC_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "origin": PUBLIC_URL },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  );

  const cookie = cookieOf(response);

  if (response.status !== 200 || cookie === "")
    throw new Error(
      `the sign-in did not answer a session (${response.status})`
    );

  const session = await auth.getSession({ headers: new Headers({ cookie }) });

  if (session === null)
    throw new Error("the signed-in session did not read back");

  return { cookie, sessionId: session.session.id };
}

/** The live session a cookie names, read through the enforced read a page makes first. */
async function liveSession(
  auth: AuthMember,
  cookie: string
): Promise<AuthSession> {
  const session = await auth.getSession({ headers: new Headers({ cookie }) });

  if (session === null) throw new Error("the cookie names no live session");

  return session;
}

type SessionRow = {
  readonly id: string;
  readonly expires_at: Date;
  readonly last_active_at: Date | null;
  readonly created_at: Date;
};

async function sessionRow(client: PoolClient, id: string): Promise<SessionRow> {
  const result = await client.query<SessionRow>(
    "select id, expires_at, last_active_at, created_at from session where id = $1",
    [id]
  );

  const row = result.rows[0];

  if (row === undefined) throw new Error(`no session row ${id}`);

  return row;
}

async function countRows(client: PoolClient, id: string): Promise<number> {
  const result = await client.query<{ readonly count: string }>(
    "select count(*) as count from session where id = $1",
    [id]
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function countByToken(
  client: PoolClient,
  token: string
): Promise<number> {
  const result = await client.query<{ readonly count: string }>(
    "select count(*) as count from session where token = $1",
    [token]
  );

  return Number(result.rows[0]?.count ?? 0);
}

/** Moves a session row's idle baseline without waiting the window out. */
async function ageSession(
  client: PoolClient,
  id: string,
  minutes: number
): Promise<void> {
  await client.query(
    "update session set last_active_at = now() - ($1 || ' minutes')::interval where id = $2",
    [minutes, id]
  );
}

describe("the session idle rule", () => {
  let deployment: DisposableDeployment;
  let client: PoolClient;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([], {
      env: AUTH_ENV,
      profile: "application",
    });

    client = await deployment.context.db.$client.connect();

    await client.query("insert into tenant_settings default values");
    await client.query("update tenant_settings set session_idle_minutes = $1", [
      IDLE_MINUTES,
    ]);
  }, 240_000);

  // The break-glass sign-in window (R-19) is per deployment; each case starts with a fresh one so
  // the number of sign-ins in this file does not decide whether a case can sign in.
  beforeEach(async () => {
    await client.query("delete from rate_limit_window");
  });

  afterAll(async () => {
    client?.release();
    await deployment?.stop();
  });

  it("answers idle-expired to every request of the browser, not only the first (genie-ops-center-v2-lqns)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "idle-race@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(auth, "idle-race@example.com");

    const liveRead = await auth.handler(
      new Request(`${PUBLIC_URL}/api/auth/get-session`, {
        headers: { cookie, origin: PUBLIC_URL },
      })
    );

    expect(await liveRead.json()).not.toBeNull();

    await ageSession(client, sessionId, IDLE_MINUTES);

    // A reload, a prefetch, and a second tab at the same moment, then the activity call and one
    // more page load after them. When the first refusal deleted the row, every request that read
    // after the delete answered anonymous, and that browser kept its dead cookie.
    const parallel = await Promise.all(
      [1, 2, 3].map(() =>
        auth.sessionState({ headers: new Headers({ cookie }) })
      )
    );

    const activity = await auth.recordActivity({
      headers: new Headers({ cookie }),
    });

    const later = await auth.sessionState({ headers: new Headers({ cookie }) });

    expect([...parallel, later]).toEqual(
      Array.from({ length: 4 }, () => ({ status: "idle-expired" }))
    );
    expect(activity).toBe(false);
    expect(
      await auth.getSession({ headers: new Headers({ cookie }) })
    ).toBeNull();
    expect(await countRows(client, sessionId)).toBe(1);

    // The kept row is invisible to Better Auth's own endpoints, so they treat the request as
    // signed out, and a password change on that session is refused (R-14).
    const getSession = await auth.handler(
      new Request(`${PUBLIC_URL}/api/auth/get-session`, {
        headers: { cookie, origin: PUBLIC_URL },
      })
    );

    expect(await getSession.json()).toBeNull();

    // Better Auth trims cookie names, so whitespace around the name must not get the idle token
    // past the handler (the session-followups review, finding 1).
    const spacedReads = await Promise.all(
      [" =", "\t=", "  ="].map(async (spaced) => {
        const answer = await auth.handler(
          new Request(`${PUBLIC_URL}/api/auth/get-session`, {
            headers: {
              cookie: cookie.replace(
                `${SESSION_COOKIE}=`,
                `${SESSION_COOKIE}${spaced}`
              ),
              origin: PUBLIC_URL,
            },
          })
        );

        return answer.json();
      })
    );

    expect(spacedReads).toEqual([null, null, null]);

    const change = await auth.handler(
      new Request(`${PUBLIC_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "cookie": cookie,
          "origin": PUBLIC_URL,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: PASSWORD,
          newPassword: "another-long-password-15",
        }),
      })
    );

    expect(change.status).toBe(401);
  });

  it("refuses a session past the 24 hour cap regardless of activity (R-13, AC-5)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "capped@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(auth, "capped@example.com");

    // A live idle baseline cannot save a session whose absolute expiry has passed.
    await client.query(
      "update session set expires_at = now() - interval '1 minute' where id = $1",
      [sessionId]
    );

    expect(
      await auth.getSession({ headers: new Headers({ cookie }) })
    ).toBeNull();
  });

  it("ordinary request traffic never slides a session (R-15, AC-5)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "background@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(auth, "background@example.com");

    const before = await sessionRow(client, sessionId);

    // Three enforced reads in one burst: none of them slides the row (AC-5).
    const states = await Promise.all(
      [1, 2, 3].map(() =>
        auth.sessionState({ headers: new Headers({ cookie }) })
      )
    );

    for (const state of states) {
      expect(state.status).toBe("authenticated");
    }

    const after = await sessionRow(client, sessionId);

    expect(after.last_active_at).toBeNull();
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  it("the activity call is the one writer of last activity (R-15)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "active@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(auth, "active@example.com");

    const before = await sessionRow(client, sessionId);

    expect(before.last_active_at).toBeNull();

    const result = await auth.recordActivity({
      headers: new Headers({ cookie }),
    });

    expect(result).toBe(true);

    const written = await sessionRow(client, sessionId);

    expect(written.last_active_at).not.toBeNull();

    // The session inside the window survives the call that slid it (AC-5).
    const state = await auth.sessionState({ headers: new Headers({ cookie }) });

    expect(state.status).toBe("authenticated");
  });

  it("an activity call does not slide a session that crossed the window after its read", async () => {
    await insertCredentialPerson(deployment.context, {
      email: "activity-boundary@example.com",
      password: PASSWORD,
    });

    // The member's clock answers these instants in order, then the real time. The read inside
    // the activity call sees the first; the write sees the second, past the window, as if a
    // parallel request had refused the session in between.
    const instants: number[] = [];

    const member = createAuthMember({
      db: deployment.context.db,
      publicUrl: PUBLIC_URL,
      logger: silentLogger(),
      settings: deployment.context.settings,
      auth: {
        betterAuthSecret: AUTH_ENV.BETTER_AUTH_SECRET,
        keycloakUrl: AUTH_ENV.KEYCLOAK_URL,
        keycloakRealm: AUTH_ENV.KEYCLOAK_REALM,
        keycloakClientId: AUTH_ENV.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: AUTH_ENV.KEYCLOAK_CLIENT_SECRET,
      },
      trustedProxies: [],
      runtimeMode: "production",
      now: () => instants.shift() ?? Date.now(),
    });

    const { cookie, sessionId } = await signIn(
      member,
      "activity-boundary@example.com"
    );

    const before = await sessionRow(client, sessionId);

    instants.push(Date.now(), Date.now() + (IDLE_MINUTES + 1) * 60_000);

    expect(
      await member.recordActivity({ headers: new Headers({ cookie }) })
    ).toBe(false);
    expect((await sessionRow(client, sessionId)).last_active_at).toEqual(
      before.last_active_at
    );
  });

  it("ends an idle session's row and never a live one (R-14, amended 2026-10-19)", async () => {
    const auth = authOf(deployment);

    const userId = await insertCredentialPerson(deployment.context, {
      email: "end-idle@example.com",
      password: PASSWORD,
    });

    const cookieFor = async (minutesAgo: number) => {
      const token = await insertSession(deployment.context, {
        userId,
        lastActiveAt: new Date(Date.now() - minutesAgo * 60_000),
      });

      return {
        token,
        cookie: await signedSessionCookie({
          token,
          secret: AUTH_ENV.BETTER_AUTH_SECRET,
          name: SESSION_COOKIE,
        }),
      };
    };

    const live = await cookieFor(1);
    const idle = await cookieFor(IDLE_MINUTES + 1);

    expect(
      await auth.endIdleSession({
        headers: new Headers({ cookie: live.cookie }),
      })
    ).toBe(false);
    expect(await countByToken(client, live.token)).toBe(1);

    expect(
      await auth.endIdleSession({
        headers: new Headers({ cookie: idle.cookie }),
      })
    ).toBe(true);
    expect(await countByToken(client, idle.token)).toBe(0);

    // Twice is harmless: the row is already gone.
    expect(
      await auth.endIdleSession({
        headers: new Headers({ cookie: idle.cookie }),
      })
    ).toBe(false);
  });

  it("removes the person's dead sessions when they sign in again, and keeps live ones (R-14)", async () => {
    const auth = authOf(deployment);

    const userId = await insertCredentialPerson(deployment.context, {
      email: "sign-in-cleanup@example.com",
      password: PASSWORD,
    });

    const idle = await insertSession(deployment.context, {
      userId,
      lastActiveAt: new Date(Date.now() - (IDLE_MINUTES + 1) * 60_000),
    });

    const capped = await insertSession(deployment.context, {
      userId,
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
    });

    const live = await insertSession(deployment.context, {
      userId,
      lastActiveAt: new Date(),
    });

    const { sessionId } = await signIn(auth, "sign-in-cleanup@example.com");

    expect(await countByToken(client, idle)).toBe(0);
    expect(await countByToken(client, capped)).toBe(0);
    expect(await countByToken(client, live)).toBe(1);
    expect(await countRows(client, sessionId)).toBe(1);

    // A second sign-in finds nothing more to remove and keeps both live sessions.
    const again = await signIn(auth, "sign-in-cleanup@example.com");

    expect(await countByToken(client, live)).toBe(1);
    expect(await countRows(client, sessionId)).toBe(1);
    expect(await countRows(client, again.sessionId)).toBe(1);
  });

  it("a failed dead-session cleanup fails neither the sign-in nor the group sync", async () => {
    const auth = authOf(deployment);

    const email = "cleanup-fails@example.com";

    const userId = await insertCredentialPerson(deployment.context, {
      email,
      password: PASSWORD,
    });

    // A leftover idle row gives the cleanup a row to delete, and the trigger refuses that delete.
    const idle = await insertSession(deployment.context, {
      userId,
      lastActiveAt: new Date(Date.now() - (IDLE_MINUTES + 1) * 60_000),
    });

    await client.query(
      `create or replace function refuse_session_delete() returns trigger language plpgsql as $$
         begin raise exception 'session delete refused by the test'; end $$`
    );
    await client.query(
      `create trigger refuse_session_delete before delete on session for each row
         when (old.user_id::text = '${userId}') execute function refuse_session_delete()`
    );

    try {
      // The credential sign-in still answers a session...
      const { sessionId } = await signIn(auth, email);

      expect(await countRows(client, sessionId)).toBe(1);
      expect(await countByToken(client, idle)).toBe(1);

      // ...and a realm sign-in still syncs its groups after the failed cleanup.
      const scope = new AuthRequestScope();

      const after = sessionCreateAfter({
        db: deployment.context.db,
        settings: deployment.context.settings,
        logger: silentLogger(),
        requestScope: scope,
        tenant: () => deployment.context,
      });

      await scope.run(async () => {
        scope.capture(["Cleanup Sync"], true);

        await after({ id: sessionId, userId });
      });

      const synced = await client.query<{ readonly count: string }>(
        `select count(*) as count from group_member m join "group" g on g.id = m.group_id
          where m.user_id = $1 and g.name = 'Cleanup Sync'`,
        [userId]
      );

      expect(Number(synced.rows[0]?.count)).toBe(1);
    } finally {
      await client.query("drop trigger refuse_session_delete on session");
      await client.query("drop function refuse_session_delete()");
    }
  });

  it("an anonymous activity call answers false and writes nothing", async () => {
    const auth = authOf(deployment);

    expect(
      await auth.recordActivity({
        headers: new Headers({ cookie: "genie-session=none" }),
      })
    ).toBe(false);
  });

  it("lists a session older than a day, hides idle-dead rows, and puts the current session first (R-13, R-18, AC-5)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "listing@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(auth, "listing@example.com");

    // An old-but-live row: created 25 hours ago, idle baseline fresh, cap still ahead.
    await client.query(
      `update session
          set created_at = now() - interval '25 hours',
              expires_at = now() + interval '1 hour',
              last_active_at = now(),
              user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        where id = $1`,
      [sessionId]
    );

    // A second, idle-dead row: the list hides it even though its cap has not passed.
    const second = await signIn(auth, "listing@example.com");

    await ageSession(client, second.sessionId, IDLE_MINUTES + 1);

    const rows = await auth.listOwnSessions({
      session: await liveSession(auth, cookie),
    });

    expect(rows?.map((row) => row.id)).toEqual([sessionId]);
    expect(rows?.[0]?.isCurrent).toBe(true);
    expect(rows?.[0]?.browser).toBe("Chrome");
    expect(rows?.[0]?.device).toBe("Windows");
  });

  it("per-session sign-out deletes another device and refuses the current one; sign out everywhere keeps the caller (R-18)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "devices@example.com",
      password: PASSWORD,
    });

    const current = await signIn(auth, "devices@example.com");
    const other = await signIn(auth, "devices@example.com");

    // Two live rows; the newest read is the caller.
    expect(
      (
        await auth.listOwnSessions({
          session: await liveSession(auth, current.cookie),
        })
      ).length
    ).toBe(2);

    await expect(
      auth.revokeOwnSession({
        headers: new Headers({ cookie: current.cookie }),
        sessionId: current.sessionId,
      })
    ).resolves.toBe("current");

    await expect(
      auth.revokeOwnSession({
        headers: new Headers({ cookie: current.cookie }),
        sessionId: other.sessionId,
      })
    ).resolves.toBe("revoked");

    expect(await countRows(client, other.sessionId)).toBe(0);

    await expect(
      auth.revokeOwnSession({
        headers: new Headers({ cookie: current.cookie }),
        sessionId: "00000000-0000-0000-0000-000000000000",
      })
    ).resolves.toBe("not-found");

    // Sign out everywhere deletes the caller's other sessions and keeps the caller's own.
    const third = await signIn(auth, "devices@example.com");

    await expect(
      auth.revokeOtherOwnSessions({
        headers: new Headers({ cookie: current.cookie }),
      })
    ).resolves.toBe(1);

    expect(await countRows(client, current.sessionId)).toBe(1);
    expect(await countRows(client, third.sessionId)).toBe(0);
  });
});
