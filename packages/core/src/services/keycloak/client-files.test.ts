import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

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

  it("keeps the description short enough for Keycloak to import", () => {
    const client = load(url);

    expect(client.description).toBeDefined();
    expect(String(client.description).length).toBeLessThan(MAX_DESCRIPTION);
  });
});
