import { type AuthMember, createTenantContext } from "@genie/core";
import { afterAll, describe, expect, it } from "vitest";

import { type AppContext, publishContext } from "../../../context.ts";
import { POST } from "./route.ts";

const PUBLIC_URL = "https://ops.example.invalid";

let sessionReads = 0;

const unused = () => Promise.reject(new Error("the route does not call this"));

/** Counts the session read that `requestPrincipal` makes; the refusal must come before it. */
const auth: AuthMember = {
  handler: unused,
  getSession: () => {
    sessionReads += 1;

    return Promise.resolve(null);
  },
  sessionState: unused,
  endIdleSession: unused,
  recordActivity: unused,
  listOwnSessions: unused,
  revokeOwnSession: unused,
  revokeOtherOwnSessions: unused,
  beginKeycloakSignIn: unused,
  signOut: unused,
  discovery: () => ({ ready: true }),
  ensureDiscovery: () => Promise.resolve({ ready: true }),
};

// The pool opens no connection until a query, and a refused request makes none.
const tenant = createTenantContext(
  {
    DATABASE_URL: "postgres://genie:secret@127.0.0.1:1/genie",
    PUBLIC_URL,
  },
  { error: () => undefined, info: () => undefined, debug: () => undefined },
  []
);

// SAFETY: a refused request reads only `tenant`; the remaining members are never reached.
publishContext({ tenant: { ...tenant, auth } } as AppContext);

afterAll(async () => {
  await tenant.db.$client.end();
});

/** The CSRF boundary of the agent route (Spec 7 R-40, P8): a model call is spent in the person's name. */
describe("POST /api/agent", () => {
  it("refuses a foreign origin before the person is read", async () => {
    const response = await POST(
      new Request(`${PUBLIC_URL}/api/agent`, {
        method: "POST",
        headers: {
          "cookie": "__Host-genie-session=token.sig",
          "origin": "https://evil.example",
          "content-type": "application/json",
        },
        body: "{}",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "cross-origin-request" });
    expect(sessionReads).toBe(0);
  });
});
