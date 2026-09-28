import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthMember } from "../src/services/auth/index.ts";
import type { DisposableDeployment } from "./index.ts";
import { insertCredentialPerson, startDisposableDeployment } from "./index.ts";

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

  afterAll(async () => {
    client?.release();
    await deployment?.stop();
  });

  it("refuses a session past the idle window, deletes the row, and names the cause (R-14, R-17a)", async () => {
    const auth = authOf(deployment);

    await insertCredentialPerson(deployment.context, {
      email: "idle-expired@example.com",
      password: PASSWORD,
    });

    const { cookie, sessionId } = await signIn(
      auth,
      "idle-expired@example.com"
    );

    await ageSession(client, sessionId, IDLE_MINUTES);

    const state = await auth.sessionState({ headers: new Headers({ cookie }) });

    expect(state).toEqual({ status: "idle-expired" });
    expect(await countRows(client, sessionId)).toBe(0);

    // The request after the deletion is plainly anonymous.
    const next = await auth.sessionState({ headers: new Headers({ cookie }) });

    expect(next).toEqual({ status: "anonymous" });
    expect(
      await auth.getSession({ headers: new Headers({ cookie }) })
    ).toBeNull();
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

  it("the activity call is the one writer of last activity and answers the idle expiry (R-15, R-15a)", async () => {
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

    expect(result).not.toBeNull();

    const written = await sessionRow(client, sessionId);

    expect(written.last_active_at).not.toBeNull();

    // R-15a: the absolute expiry is computed from the activity just written.
    // SAFETY: the assertion above `expect(written.last_active_at).not.toBeNull()` leaves a
    // non-null Date, which is the only branch this cast serves.
    const expected =
      (written.last_active_at as Date).getTime() + IDLE_MINUTES * 60_000;

    expect(
      Math.abs((result?.idleExpiresAt.getTime() ?? 0) - expected)
    ).toBeLessThan(1_000);

    // The session inside the window survives the call that slid it (AC-5).
    const state = await auth.sessionState({ headers: new Headers({ cookie }) });

    expect(state.status).toBe("authenticated");
  });

  it("an anonymous activity call answers null and writes nothing", async () => {
    const auth = authOf(deployment);

    expect(
      await auth.recordActivity({
        headers: new Headers({ cookie: "genie-session=none" }),
      })
    ).toBeNull();
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
      headers: new Headers({ cookie }),
    });

    expect(rows).not.toBeNull();
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
          headers: new Headers({ cookie: current.cookie }),
        })
      )?.length
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
