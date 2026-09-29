import { describe, expect, it } from "vitest";

import {
  BUNDLED_KEYCLOAK_PROFILE,
  type KeycloakAddressEnvironment,
  type KeycloakAddressFacts,
  KEYCLOAK_ADDRESS_MESSAGES,
  KeycloakAddressError,
  keycloakAddressResult,
  stackProfiles,
} from "./address-guard.ts";

const SETUP_URL = "https://id.example.com";

const stored = (
  overrides: Partial<KeycloakAddressFacts> = {}
): KeycloakAddressFacts => ({
  realmMode: "managed",
  keycloakUrlAtSetup: SETUP_URL,
  ...overrides,
});

const env = (
  overrides: Partial<KeycloakAddressEnvironment> = {}
): KeycloakAddressEnvironment => ({
  keycloakUrl: SETUP_URL,
  stackProfiles: "",
  ...overrides,
});

describe("the R-54c address comparison", () => {
  it("refuses client-only mode while the stack runs its own Keycloak", () => {
    const result = keycloakAddressResult(
      stored({ realmMode: "customer" }),
      env({ stackProfiles: BUNDLED_KEYCLOAK_PROFILE })
    );

    expect(result).toEqual({
      ok: false,
      cause: "client_only_bundled_keycloak",
      message: "client-only mode, but the stack runs its own Keycloak",
    });
  });

  it("refuses a KEYCLOAK_URL that is not the address setup used", () => {
    const result = keycloakAddressResult(
      stored(),
      env({ keycloakUrl: "https://other.example.com" })
    );

    expect(result).toEqual({
      ok: false,
      cause: "keycloak_url_mismatch",
      message: "KEYCLOAK_URL is not the Keycloak that setup used",
    });
  });

  it("compares both sides after the R-54c normalization", () => {
    // Same address written with a different case, the default port and a trailing slash.
    const result = keycloakAddressResult(
      stored({ keycloakUrlAtSetup: "https://ID.example.com:443/" }),
      env({ keycloakUrl: "https://id.example.com" })
    );

    expect(result).toEqual({ ok: true });
  });

  it("still refuses an address that differs after normalization", () => {
    const result = keycloakAddressResult(
      stored({ keycloakUrlAtSetup: "https://id.example.com:8443" }),
      env({ keycloakUrl: "https://id.example.com" })
    );

    expect(result).toMatchObject({ ok: false, cause: "keycloak_url_mismatch" });
  });

  it("accepts a managed stack that matches its recorded address", () => {
    expect(keycloakAddressResult(stored(), env())).toEqual({ ok: true });
  });

  it("does not refuse client-only mode without the bundled profile", () => {
    // A customer realm on another server is exactly what client-only mode needs (R-54a/b).
    expect(
      keycloakAddressResult(
        stored({ realmMode: "customer" }),
        env({ stackProfiles: "" })
      )
    ).toEqual({ ok: true });

    expect(
      keycloakAddressResult(
        stored({ realmMode: "customer" }),
        env({ stackProfiles: "some-other-profile" })
      )
    ).toEqual({ ok: true });
  });

  it("skips the comparison until setup has written keycloak_url_at_setup", () => {
    // Before setup, the setup gate already refuses sign-in, so there is nothing to compare.
    expect(
      keycloakAddressResult(
        { realmMode: "customer", keycloakUrlAtSetup: null },
        env({ keycloakUrl: "https://other.example.com" })
      )
    ).toEqual({ ok: true });

    expect(
      keycloakAddressResult(
        { realmMode: "managed", keycloakUrlAtSetup: null },
        env({ keycloakUrl: "https://other.example.com" })
      )
    ).toEqual({ ok: true });
  });

  it("skips the URL comparison when the profile carries no KEYCLOAK_URL", () => {
    // `genie-ops migrate`, `setup` and a worker without an identity consumer read none.
    expect(
      keycloakAddressResult(stored(), env({ keycloakUrl: undefined }))
    ).toEqual({ ok: true });
  });

  it("skips the comparison when no tenant_settings row exists", () => {
    expect(
      keycloakAddressResult(
        { realmMode: null, keycloakUrlAtSetup: null },
        env({ keycloakUrl: "https://other.example.com" })
      )
    ).toEqual({ ok: true });
  });
});

describe("reading the Compose profile list", () => {
  it("splits on commas and trims, an unset or empty value being the empty list", () => {
    expect(stackProfiles(undefined)).toEqual([]);
    expect(stackProfiles("")).toEqual([]);
    expect(stackProfiles("  ")).toEqual([]);
    expect(stackProfiles("bundled-keycloak")).toEqual(["bundled-keycloak"]);
    expect(stackProfiles("a, bundled-keycloak ,b")).toEqual([
      "a",
      "bundled-keycloak",
      "b",
    ]);
  });
});

describe("the guard refusal", () => {
  it("carries the named cause and the spec's message", () => {
    const error = new KeycloakAddressError({
      cause: "client_only_bundled_keycloak",
    });

    expect(error.code).toBe("client_only_bundled_keycloak");
    expect(error.message).toBe(
      KEYCLOAK_ADDRESS_MESSAGES.client_only_bundled_keycloak
    );
    expect(error.name).toBe("KeycloakAddressError");
  });
});
