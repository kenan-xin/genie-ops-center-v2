import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GENIE_STUDIO_CALLBACK_PATH } from "../../lib/tenant-config/genie-studio.ts";
import { IDENTITY_CALLBACK_PATH } from "../../lib/tenant-context/index.ts";
import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "./representation.ts";

/**
 * The two shipped client files of client-only mode (Spec 2 R-54a, ADR 0010) are importable
 * Keycloak client representations. They are not read by the application, so this keeps their
 * contract under test: PKCE required, the `groups` mapper and the `genie_groups` marker, and the
 * `PUBLIC_URL` placeholder. Keycloak 26.7.4 answers a 500 when a client `description` is too long,
 * so the length is bounded here too.
 */
const FILES = {
  "genie-ops-center": new URL(
    "../../../../../deploy/keycloak/genie-ops-center.client.json",
    import.meta.url
  ),
  "genie-studio": new URL(
    "../../../../../deploy/keycloak/genie-studio.client.json",
    import.meta.url
  ),
} as const;

/**
 * The callback path each product completes the code exchange on. genie-studio's backend has its own
 * path, so its file must not carry the Ops Center path (the realm template fills the same values).
 */
const CALLBACK_PATHS = {
  "genie-ops-center": IDENTITY_CALLBACK_PATH,
  "genie-studio": GENIE_STUDIO_CALLBACK_PATH,
} as const;

/** The maximum client `description` Keycloak accepts before it answers a 500. */
const MAX_DESCRIPTION = 255;

function load(url: URL): JsonObject {
  // SAFETY: the shipped file holds JSON, which is exactly a JsonValue; the object check below
  // rejects anything else.
  const parsed = JSON.parse(readFileSync(url, "utf8")) as JsonValue;

  if (!isJsonObject(parsed))
    throw new Error(`${url.pathname} is not a JSON object`);

  return parsed;
}

function mapper(client: JsonObject, name: string): JsonObject | undefined {
  const mappers = client.protocolMappers;

  if (!Array.isArray(mappers)) return undefined;

  return mappers.find(
    (entry): entry is JsonObject => isJsonObject(entry) && entry.name === name
  );
}

describe.each(Object.entries(FILES))("the %s client file", (clientId, url) => {
  it("requires PKCE, carries the groups mapper and the marker, and keeps the placeholder", () => {
    const client = load(url);

    expect(client.clientId).toBe(clientId);
    expect(client.protocol).toBe("openid-connect");
    expect(client.publicClient).toBe(false);
    expect(client.standardFlowEnabled).toBe(true);
    // A shared customer realm: the app needs only its own groups and marker, so the token does not
    // carry the person's roles for the company's other clients (R-54a).
    expect(client.fullScopeAllowed).toBe(false);

    const attributes = client.attributes;

    if (attributes === undefined || !isJsonObject(attributes))
      throw new Error(`${clientId} has no attributes`);

    expect(attributes["pkce.code.challenge.method"]).toBe("S256");

    expect(mapper(client, "groups")?.protocolMapper).toBe(
      "oidc-group-membership-mapper"
    );
    expect(mapper(client, "groups")?.config).toMatchObject({
      "full.path": "false",
      "claim.name": "groups",
    });

    expect(mapper(client, "genie_groups")?.protocolMapper).toBe(
      "oidc-hardcoded-claim-mapper"
    );
    expect(mapper(client, "genie_groups")?.config).toMatchObject({
      "claim.name": "genie_groups",
      "claim.value": "true",
      "jsonType.label": "boolean",
    });

    expect(JSON.stringify(client.redirectUris)).toContain(".invalid");
  });

  it("registers the callback path its own product completes the sign-in on", () => {
    const client = load(url);
    const redirects = client.redirectUris;

    if (!Array.isArray(redirects))
      throw new Error(`${clientId} has no redirect URIs`);

    const expected = Object.entries(CALLBACK_PATHS).find(
      ([id]) => id === clientId
    )?.[1];

    expect(expected).toBeDefined();
    expect(redirects).toHaveLength(1);
    expect(new URL(String(redirects[0])).pathname).toBe(expected);
  });

  it("keeps the description short enough for Keycloak to import", () => {
    const client = load(url);

    expect(client.description).toBeDefined();
    expect(String(client.description).length).toBeLessThan(MAX_DESCRIPTION);
  });
});
