import { describe, expect, it } from "vitest";

import {
  ATTRIBUTE_IMPORTER_IDS,
  groupsMapper,
  IMPORTER_SYNC_MODE,
  oidcDiscoveryUrl,
} from "./index.ts";

/**
 * The pure parts of `idp set`: the discovery URL an operator's issuer becomes, and the Attribute
 * Importer mapper whose sync mode decides whether an emptied claim clears the `groups` attribute.
 */
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
