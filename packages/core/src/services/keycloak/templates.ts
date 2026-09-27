import { readFileSync } from "node:fs";

import type { JsonObject } from "./representation.ts";

/**
 * The two realm template variants, checked into `deploy/keycloak/` (Spec 2 R-49). The spelling
 * below — `new URL` against `import.meta.url` — is what the production bundler traces to copy the
 * JSON into the image, the same way the migrator's SQL files are traced. This module declares the
 * references only; the read happens when the realm step asks for it.
 */
const BROKERED_TEMPLATE = new URL(
  "../../../../../deploy/keycloak/realm-template.json",
  import.meta.url
);

const LOCAL_TEMPLATE = new URL(
  "../../../../../deploy/keycloak/realm-template.local.json",
  import.meta.url
);

export type RealmTemplateVariant = "brokered" | "local";

/** The variant `local_accounts` selects (Spec 2 R-53, DEC-36). */
export function realmTemplateVariant(
  localAccounts: boolean
): RealmTemplateVariant {
  return localAccounts ? "local" : "brokered";
}

/** Reads one template variant as its parsed JSON object. */
export function loadRealmTemplate(localAccounts: boolean): JsonObject {
  const url =
    realmTemplateVariant(localAccounts) === "local"
      ? LOCAL_TEMPLATE
      : BROKERED_TEMPLATE;

  // SAFETY: the template is a checked-in JSON document whose top level is an object (R-49).
  return JSON.parse(readFileSync(url, "utf8")) as JsonObject;
}
