import {
  type AuthMember,
  type AuthSession,
  type AuthSessionState,
  createTenantContext,
} from "@genie/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { type AppContext, publishContext } from "../../../../context.ts";
import { POST } from "./route.ts";

const PUBLIC_URL = "https://ops.example.invalid";

const EXPIRED_BANNER = `${PUBLIC_URL}/sign-in?error=session_expired`;

const CLEARED = /^__Host-genie-session=;.*Expires=Thu, 01 Jan 1970/;

const LIVE: AuthSessionState = {
  status: "authenticated",
  // SAFETY: the route reads only the status of the state; the session body is never read.
  session: {} as AuthSession,
};

/** What the stub auth member answers; each case sets it before its request. */
let current: AuthSessionState = { status: "anonymous" };

const calls = { sessionState: 0, signOut: 0, endIdleSession: 0 };

const unused = () => Promise.reject(new Error("the route does not call this"));

/** Better Auth's own sign-out answer: a provider logout URL and the cookie that clears the session. */
const auth: AuthMember = {
  handler: unused,
  getSession: unused,
  sessionState: () => {
    calls.sessionState += 1;

    return Promise.resolve(current);
  },
  endIdleSession: () => {
    calls.endIdleSession += 1;

    return Promise.resolve(true);
  },
  recordActivity: unused,
  listOwnSessions: unused,
  revokeOwnSession: unused,
  revokeOtherOwnSessions: unused,
  beginKeycloakSignIn: unused,
  signOut: () => {
    calls.signOut += 1;

    return Promise.resolve({
      providerLogoutUrl: "https://idp.example.invalid/logout",
      headers: new Headers({
        "set-cookie":
          "__Host-genie-session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure",
      }),
    });
  },
  discovery: () => ({ ready: true }),
  ensureDiscovery: () => Promise.resolve({ ready: true }),
};

// The pool opens no connection until a query, and the route makes none.
const tenant = createTenantContext(
  {
    DATABASE_URL: "postgres://genie:secret@127.0.0.1:1/genie",
    PUBLIC_URL,
  },
  { error: () => undefined, info: () => undefined, debug: () => undefined },
  []
);

/** The realm sign-out reads the realm mode; the stub answers it without a database. */
const settings = {
  ...tenant.settings,
  get: () =>
    // SAFETY: the route reads only `realmMode` from the settings row.
    Promise.resolve({ realmMode: "managed" } as Awaited<
      ReturnType<typeof tenant.settings.get>
    >),
};

// SAFETY: the route reads only `tenant`; the remaining members are unused by this one handler.
publishContext({ tenant: { ...tenant, auth, settings } } as AppContext);

afterAll(async () => {
  await tenant.db.$client.end();
});

beforeEach(() => {
  calls.sessionState = 0;
  calls.signOut = 0;
  calls.endIdleSession = 0;
});

function signOut(input: { idle: boolean; origin?: string }): Promise<Response> {
  return POST(
    new Request(
      `${PUBLIC_URL}/api/auth/sign-out${input.idle ? "?idle=1" : ""}`,
      {
        method: "POST",
        headers: {
          cookie: "__Host-genie-session=token.sig",
          origin: input.origin ?? PUBLIC_URL,
        },
      }
    )
  );
}

/** The idle sign-out that the browser posts when its idle count ends (Spec 02 R-15a, R-17). */
describe("POST /api/auth/sign-out", () => {
  it("ends a live session on the idle flag and lands on the expired banner", async () => {
    current = LIVE;

    const response = await signOut({ idle: true });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(EXPIRED_BANNER);
    expect(calls.signOut).toBe(1);
    expect(response.headers.getSetCookie()).toContainEqual(
      expect.stringMatching(CLEARED)
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("lands a browser whose session another tab ended on the expired banner", async () => {
    current = { status: "anonymous" };

    const response = await signOut({ idle: true });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(EXPIRED_BANNER);
    expect(response.headers.getSetCookie()).toContainEqual(
      expect.stringMatching(CLEARED)
    );
    expect(calls.signOut).toBe(0);
    expect(calls.endIdleSession).toBe(0);
  });

  it("keeps the realm sign-out without the flag", async () => {
    current = LIVE;

    const response = await signOut({ idle: false });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/idp\.example\.invalid\/logout/
    );
  });

  it("refuses the idle flag from another origin", async () => {
    current = LIVE;

    const response = await signOut({
      idle: true,
      origin: "https://evil.example.test",
    });

    expect(response.status).toBe(403);
    expect(calls).toEqual({ sessionState: 0, signOut: 0, endIdleSession: 0 });
  });
});
