import { describe, expect, it } from "vitest";

import {
  APPLICATION_USER_FIELDS,
  discoveryDocumentUrl,
  keycloakIssuer,
  keycloakProviderConfig,
  normalizeKeycloakUrl,
  SESSION_ABSOLUTE_SECONDS,
  sessionCookieName,
} from "./config.ts";

describe("the session cookie name", () => {
  it("is the __Host- name over HTTPS (R-4a)", () => {
    expect(sessionCookieName("https://genie.example.com")).toBe(
      "__Host-genie-session"
    );
  });

  it("drops the prefix over plain HTTP, because a browser refuses it (R-4a)", () => {
    expect(sessionCookieName("http://127.0.0.1:3000")).toBe("genie-session");
  });
});

describe("the Keycloak address values", () => {
  it("removes a trailing slash once, so the issuer comparison is exact (R-54c)", () => {
    expect(normalizeKeycloakUrl("https://id.example.com/")).toBe(
      "https://id.example.com"
    );
    expect(
      normalizeKeycloakUrl("https://id.example.com").replace(/\/+$/, "")
    ).toBe("https://id.example.com");
  });

  it("builds the issuer and the discovery URL from the base and realm (R-5, R-54d)", () => {
    expect(keycloakIssuer("https://id.example.com/", "genie")).toBe(
      "https://id.example.com/realms/genie"
    );
    expect(discoveryDocumentUrl("https://id.example.com/", "genie")).toBe(
      "https://id.example.com/realms/genie/.well-known/openid-configuration"
    );
  });
});

describe("the Keycloak provider configuration", () => {
  it("registers the keycloak provider the spec names, with PKCE and verified id tokens (R-5, R-54d)", () => {
    const provider = keycloakProviderConfig({
      keycloakUrl: "https://id.example.com/",
      realm: "genie",
      clientId: "genie-ops-center",
      clientSecret: "secret",
      publicUrl: "https://genie.example.com",
    });

    expect(provider.providerId).toBe("keycloak");
    expect(provider.discoveryUrl).toBe(
      "https://id.example.com/realms/genie/.well-known/openid-configuration"
    );
    expect(provider.clientId).toBe("genie-ops-center");
    expect(provider.pkce).toBe(true);
    expect(provider.requireIdTokenVerification).toBe(true);
    expect(provider.scopes).toEqual(["openid", "profile", "email"]);
    expect(provider.postLogoutRedirectURI).toBe("https://genie.example.com");
  });
});

describe("the fixed session cap", () => {
  it("is 86400 seconds (R-13)", () => {
    expect(SESSION_ABSOLUTE_SECONDS).toBe(86_400);
  });
});

describe("the application user columns", () => {
  it("marks every one input:false, so no Better Auth endpoint writes it (D2-5)", () => {
    for (const field of Object.values(APPLICATION_USER_FIELDS)) {
      expect(field.input).toBe(false);
    }
  });
});
