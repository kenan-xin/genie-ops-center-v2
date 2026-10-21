import { readFile } from "node:fs/promises";

import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "../src/services/keycloak/representation.ts";

/**
 * The shipped client files of client-only mode (Spec 2 R-54a, ADR 0010) are importable Keycloak
 * client representations that carry a placeholder host where this deployment's own URL goes. The
 * runbook tells the customer's IT to replace it; the tests render the same way, so the placeholder
 * contract lives in one place.
 */
export const CLIENT_FILE_PLACEHOLDER_HOSTS = [
  "replace-with-your-public-url.invalid",
  "replace-with-your-genie-studio-url.invalid",
] as const;

/**
 * Renders one shipped client file for this deployment: replaces the placeholder host in the
 * redirect URIs, the web origin, and the post-logout redirect URI with `deploymentUrl` and parses
 * the result as a Keycloak client representation. A file that is not a JSON object is a failure.
 */
export async function renderClientFile(
  path: string,
  deploymentUrl: string
): Promise<JsonObject> {
  const text = await readFile(path, "utf8");
  const base = deploymentUrl.replace(/\/$/, "");

  let rendered = text;

  for (const host of CLIENT_FILE_PLACEHOLDER_HOSTS) {
    rendered = rendered.replaceAll(`https://${host}`, base);
  }

  // SAFETY: the shipped file holds JSON, which is exactly a JsonValue.
  const parsed: JsonValue = JSON.parse(rendered) as JsonValue;

  if (!isJsonObject(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }

  return parsed;
}

/** The repository-relative folder the two client files ship in. */
export const CLIENT_FILE_DIRECTORY = "deploy/keycloak";

/** The `genie-ops-center` client file name. */
export const OPS_CENTER_CLIENT_FILE = "genie-ops-center.client.json";

/** The `genie-studio` client file name. */
export const STUDIO_CLIENT_FILE = "genie-studio.client.json";
