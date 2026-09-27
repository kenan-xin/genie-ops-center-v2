import { describe, expect, it } from "vitest";

import { normalizeKeycloakUrl } from "./normalize-url.ts";

describe("normalizeKeycloakUrl", () => {
  it("lower-cases the scheme and host", () => {
    expect(normalizeKeycloakUrl("HTTPS://ID.Example.COM")).toBe(
      "https://id.example.com"
    );
  });

  it("removes a default port", () => {
    expect(normalizeKeycloakUrl("https://id.example.com:443/")).toBe(
      "https://id.example.com"
    );
    expect(normalizeKeycloakUrl("http://id.example.com:80/")).toBe(
      "http://id.example.com"
    );
  });

  it("keeps a non-default port", () => {
    expect(normalizeKeycloakUrl("https://id.example.com:8443/")).toBe(
      "https://id.example.com:8443"
    );
  });

  it("removes a trailing slash", () => {
    expect(normalizeKeycloakUrl("https://id.example.com/")).toBe(
      "https://id.example.com"
    );
  });

  it("normalizes the same address written differently to one form", () => {
    expect(normalizeKeycloakUrl("https://ID.example.com:443/")).toBe(
      normalizeKeycloakUrl("https://id.example.com")
    );
  });

  it("refuses a scheme that is not http or https", () => {
    expect(() => normalizeKeycloakUrl("ftp://id.example.com")).toThrow(
      "KEYCLOAK_URL"
    );
  });
});
