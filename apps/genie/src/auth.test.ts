import { describe, expect, it } from "vitest";

import { signOutDestination } from "./auth.ts";

const PUBLIC_URL = "https://genie.example.com";

const END_SESSION =
  "https://id.example.com/realms/genie/protocol/openid-connect/logout";

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
