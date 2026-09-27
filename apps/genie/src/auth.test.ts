import { describe, expect, it } from "vitest";

import {
  authPath,
  authRouteAllowed,
  readAuthRequestBody,
  signInCause,
  signOutDestination,
} from "./auth.ts";

const NONE = { kind: "other" } as const;

const PLAIN = { kind: "object", carriesIdToken: false } as const;

function post(body: string) {
  return readAuthRequestBody(
    new Request("https://genie.example.com/api/auth/sign-in/social", {
      method: "POST",
      body,
    })
  );
}

const PUBLIC_URL = "https://genie.example.com";

const END_SESSION =
  "https://id.example.com/realms/genie/protocol/openid-connect/logout";

describe("the auth route allowlist", () => {
  it("serves the callback, break-glass sign-in and the session read", () => {
    for (const [method, path] of [
      ["GET", "/callback/keycloak"],
      ["POST", "/callback/keycloak"],
      ["POST", "/sign-in/email"],
      ["GET", "/get-session"],
    ] as const) {
      expect(authRouteAllowed({ method, path, body: NONE }), path).toBe(true);
    }
  });

  it("serves a social sign-in only without an idToken field (R-6)", async () => {
    const path = "/sign-in/social";

    const [plain, withIdToken, list, broken] = await Promise.all([
      post(JSON.stringify({ provider: "keycloak" })),
      post(
        JSON.stringify({ provider: "keycloak", idToken: { token: "a.b.c" } })
      ),
      post("[]"),
      post("not json"),
    ]);

    expect(authRouteAllowed({ method: "POST", path, body: plain })).toBe(true);
    expect(authRouteAllowed({ method: "POST", path, body: withIdToken })).toBe(
      false
    );
    expect(authRouteAllowed({ method: "POST", path, body: list })).toBe(false);
    expect(authRouteAllowed({ method: "POST", path, body: broken })).toBe(
      false
    );
  });

  it("refuses the token-reading and account-linking endpoints and a wrong method (R-7)", () => {
    for (const path of [
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/sign-up/email",
      "/update-user",
    ]) {
      expect(
        authRouteAllowed({ method: "POST", path, body: PLAIN }),
        path
      ).toBe(false);
      expect(authRouteAllowed({ method: "GET", path, body: NONE }), path).toBe(
        false
      );
    }

    expect(
      authRouteAllowed({ method: "POST", path: "/get-session", body: PLAIN })
    ).toBe(false);
  });
});

describe("the auth path", () => {
  it("reads the raw pathname, so an encoded path stays encoded and is refused", () => {
    const base = "https://genie.example.com/api/auth";

    expect(authPath(`${base}/get-session`)).toBe("/get-session");
    expect(authPath(`${base}/get%2Dsession`)).toBe("/get%2Dsession");
    expect(authPath(`${base}/callback%2Fkeycloak`)).toBe(
      "/callback%2Fkeycloak"
    );

    for (const path of ["/get%2Dsession", "/callback%2Fkeycloak"]) {
      expect(authRouteAllowed({ method: "GET", path, body: NONE }), path).toBe(
        false
      );
    }
  });
});

describe("the sign-in page cause", () => {
  it("maps each Better Auth refusal to a state a person can act on (R-17a)", () => {
    expect(signInCause("keycloak_unavailable")).toBe("keycloak_unavailable");
    expect(signInCause("signup_disabled")).toBe("not_registered");
    expect(signInCause("account_not_linked")).toBe("not_registered");
    expect(signInCause("unable_to_link_account")).toBe("not_registered");
    expect(signInCause("break_glass_not_linkable")).toBe("not_registered");
    expect(signInCause("state_mismatch")).toBe("session_missing");
    expect(signInCause("<script>")).toBeUndefined();
    expect(signInCause(undefined)).toBeUndefined();
  });
});

describe("the sign-out destination", () => {
  it("sends the browser to the realm's end-session URL in managed mode (R-17)", () => {
    expect(
      signOutDestination({
        realmMode: "managed",
        providerLogoutUrl: END_SESSION,
        publicUrl: PUBLIC_URL,
      })
    ).toBe(END_SESSION);
  });

  it("falls back to PUBLIC_URL in managed mode when the realm offered no end-session URL", () => {
    expect(
      signOutDestination({
        realmMode: "managed",
        providerLogoutUrl: undefined,
        publicUrl: PUBLIC_URL,
      })
    ).toBe(PUBLIC_URL);
  });

  it("never sends the browser to the realm in client-only mode (ADR 0010)", () => {
    expect(
      signOutDestination({
        realmMode: "customer",
        providerLogoutUrl: END_SESSION,
        publicUrl: PUBLIC_URL,
      })
    ).toBe(PUBLIC_URL);
  });
});
