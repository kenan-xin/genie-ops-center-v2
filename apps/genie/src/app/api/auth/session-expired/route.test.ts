import {
  type AuthMember,
  type AuthSession,
  type AuthSessionState,
  createTenantContext,
} from "@genie/core";
import { afterAll, describe, expect, it } from "vitest";

import { type AppContext, publishContext } from "../../../../context.ts";
import { GET } from "./route.ts";

const PUBLIC_URL = "https://ops.example.invalid";

const LIVE: AuthSessionState = {
  status: "authenticated",
  // SAFETY: the route reads only the status of the state; the session body is never read.
  session: {} as AuthSession,
};

/** What the stub auth member answers; each case sets it before its visit. */
let current: AuthSessionState = { status: "anonymous" };

const unused = () => Promise.reject(new Error("the route does not call this"));

/** The auth member the route reads; only its enforced read answers. */
const auth: AuthMember = {
  handler: unused,
  getSession: unused,
  sessionState: () => Promise.resolve(current),
  recordActivity: unused,
  listOwnSessions: unused,
  revokeOwnSession: unused,
  revokeOtherOwnSessions: unused,
  beginKeycloakSignIn: unused,
  signOut: unused,
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

// One process publishes one context, so the stub reads the case's state at call time.
// SAFETY: the route reads only `tenant`; the remaining members are unused by this one handler.
publishContext({ tenant: { ...tenant, auth } } as AppContext);

afterAll(async () => {
  await tenant.db.$client.end();
});

function answering(state: AuthSessionState): void {
  current = state;
}

function visit(): Promise<Response> {
  return GET(
    new Request(`${PUBLIC_URL}/api/auth/session-expired`, {
      headers: {
        "cookie": "__Host-genie-session=token.sig",
        "sec-fetch-site": "cross-site",
      },
    })
  );
}

/**
 * genie-ops-center-v2-1rr0: a link from another site to this route must not sign a live browser
 * out. Only a cookie that names no live session is cleared.
 */
describe("GET /api/auth/session-expired", () => {
  it("sends a live session home and leaves its cookie alone", async () => {
    answering(LIVE);

    const response = await visit();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_URL}/`);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each(["idle-expired", "anonymous"] as const)(
    "clears the cookie of a %s session and shows the expired banner",
    async (status) => {
      answering({ status });

      const response = await visit();

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `${PUBLIC_URL}/sign-in?error=session_expired`
      );
      expect(response.headers.getSetCookie()).toEqual([
        expect.stringMatching(
          /^__Host-genie-session=;.*Expires=Thu, 01 Jan 1970/
        ),
      ]);
    }
  );
});
