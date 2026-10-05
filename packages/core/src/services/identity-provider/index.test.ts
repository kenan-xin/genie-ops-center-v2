import { describe, expect, it } from "vitest";

import {
  assertIdpUrl,
  ATTRIBUTE_IMPORTER_IDS,
  groupsMapper,
  IMPORTER_SYNC_MODE,
  oidcDiscoveryUrl,
  providerMappers,
} from "./index.ts";

/**
 * The pure parts of `idp set`: the URL check that keeps userinfo and plain HTTP out of the audit
 * row and the metadata, the discovery URL an operator's issuer becomes, and the Attribute Importer
 * mappers whose sync mode decides whether an emptied claim clears the attribute.
 */
describe("the idp URL check", () => {
  it("refuses a URL that carries a username or password", () => {
    expect(() =>
      assertIdpUrl("https://user:pass@idp.example/metadata", false)
    ).toThrow(/username or password/);
  });

  it("refuses a value that is not a URL", () => {
    expect(() => assertIdpUrl("not-a-url", false)).toThrow();
  });

  it("refuses plain http without the explicit flag", () => {
    expect(() => assertIdpUrl("http://idp.example/metadata", false)).toThrow(
      /https/
    );
  });

  it("refuses plain http on a loopback host without the flag, so https is the rule", () => {
    expect(() =>
      assertIdpUrl("http://127.0.0.1:8080/realms/company", false)
    ).toThrow(/https/);
  });

  it("allows plain http only when --allow-http is passed", () => {
    expect(assertIdpUrl("http://idp.example/metadata", true)).toBe(
      "http://idp.example/metadata"
    );
  });

  it("allows https with or without the flag", () => {
    expect(assertIdpUrl("https://idp.example/metadata", false)).toBe(
      "https://idp.example/metadata"
    );
    expect(assertIdpUrl("https://idp.example/metadata", true)).toBe(
      "https://idp.example/metadata"
    );
  });
});

describe("the OIDC discovery URL", () => {
  it("appends the well-known suffix to a bare issuer", () => {
    expect(oidcDiscoveryUrl("https://id.example.com/realms/acme")).toBe(
      "https://id.example.com/realms/acme/.well-known/openid-configuration"
    );
  });

  it("leaves a discovery URL alone, trailing slash included", () => {
    expect(
      oidcDiscoveryUrl(
        "https://id.example.com/realms/acme/.well-known/openid-configuration/"
      )
    ).toBe(
      "https://id.example.com/realms/acme/.well-known/openid-configuration"
    );
  });
});

describe("the Attribute Importer mapper", () => {
  it("forces the sync mode, so a sign-in with no groups clears the attribute (DEC-41)", () => {
    const mapper = groupsMapper({
      protocol: "oidc",
      alias: "company",
      groupsClaim: "groups",
    });

    expect(mapper.identityProviderMapper).toBe(ATTRIBUTE_IMPORTER_IDS.oidc);
    expect(mapper.config).toMatchObject({
      "syncMode": IMPORTER_SYNC_MODE,
      "user.attribute": "groups",
      "claim": "groups",
    });
    // The failing mode the note asks to avoid: an import-once mapper leaves a stale attribute.
    expect(IMPORTER_SYNC_MODE).not.toBe("IMPORT");
  });

  it("reads the SAML attribute name for a SAML provider", () => {
    const mapper = groupsMapper({
      protocol: "saml",
      alias: "company",
      groupsClaim: "memberOf",
    });

    expect(mapper.identityProviderMapper).toBe(ATTRIBUTE_IMPORTER_IDS.saml);
    expect(mapper.config).toMatchObject({
      "syncMode": "FORCE",
      "user.attribute": "groups",
      "attribute.name": "memberOf",
    });
  });
});

describe("the mappers idp set writes", () => {
  const attributes = {
    alias: "company-login",
    groupsClaim: "groups",
    emailAttribute: "mail",
    firstNameAttribute: "givenName",
    lastNameAttribute: "sn",
  };

  it("writes only groups for OIDC, which carries the profile in the id token", () => {
    const names = providerMappers({ protocol: "oidc", ...attributes }).map(
      (mapper) => mapper.name
    );

    expect(names).toEqual(["groups"]);
  });

  it("writes email, firstName and lastName for SAML, from the named attributes", () => {
    const mappers = providerMappers({ protocol: "saml", ...attributes });

    expect(mappers.map((mapper) => mapper.name)).toEqual([
      "groups",
      "email",
      "firstName",
      "lastName",
    ]);

    const email = mappers.find((mapper) => mapper.name === "email");

    expect(email?.config).toMatchObject({
      "attribute.name": "mail",
      "user.attribute": "email",
      "syncMode": "FORCE",
    });
  });
});
