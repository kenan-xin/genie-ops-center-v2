import { cloneDeep, mergeWith } from "es-toolkit";

import { IDENTITY_CALLBACK_PATH } from "../../lib/tenant-context/index.ts";

/**
 * A JSON value, the shape Keycloak's realm representation takes. The representation has no fixed
 * schema this repository owns, so this is exactly what a JSON document can be and nothing richer
 * (D2-3). The object variant is the mutable realm representation the merge and fill steps build.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The mutable object form of a JSON document, which a realm representation always is. */
export type JsonObject = { [key: string]: JsonValue };

/** True when a JSON value is the object variant, as a type guard for `JsonValue`. */
export function isJsonObject(value: JsonValue): value is JsonObject {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed JSON value is object or not; this is the discriminator.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The top-level keys a `realm.overrides.json` may change (D2-3). Every key core fills or that
 * carries a spec rule is excluded: the clients, the `users` list with the service account, the
 * identity providers and their mappers, client scopes and protocol mappers, authentication flows,
 * brute-force settings, the email theme, the display name, the SMTP server, and every secret. A
 * new key needs a change to the plan, not a widening here.
 */
export const REALM_OVERRIDE_ALLOW_LIST: readonly string[] = [
  "ssoSessionIdleTimeout",
  "ssoSessionMaxLifespan",
  "accessTokenLifespan",
  "passwordPolicy",
  "loginTheme",
  "internationalizationEnabled",
  "supportedLocales",
  "defaultLocale",
];

/** The values core owns and writes into the merged representation (R-53, D2-3 step 3). */
export type RealmFill = {
  readonly realm: string;
  readonly displayName: string;
  readonly publicUrl: string;
  readonly clientSecret: string;
  readonly adminClientSecret: string;
  readonly smtp: RealmSmtp | undefined;
};

/** The SMTP values the local variant carries, parsed from the mail configuration (R-53, DEC-40). */
export type RealmSmtp = {
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly password: string;
  readonly from: string;
  readonly fromDisplayName: string | undefined;
  readonly replyTo: string | undefined;
  readonly replyToDisplayName: string | undefined;
  /** Implicit TLS, from a `smtps:` URL. */
  readonly ssl: boolean;
  /** STARTTLS upgrade, from a plain `smtp:` URL. */
  readonly starttls: boolean;
};

/**
 * Refuses a `realm.overrides.json` that is not a JSON object, and an override key outside the
 * allow-list, naming the key (D2-3 step 4). The refusal is a named cause, not a Keycloak error:
 * the operator fixes the file and runs setup again.
 */
export function checkRealmOverrides(
  overrides: JsonValue
): asserts overrides is JsonObject {
  if (!isJsonObject(overrides)) {
    throw new Error("realm.overrides.json must be a JSON object");
  }

  for (const key of Object.keys(overrides)) {
    if (!REALM_OVERRIDE_ALLOW_LIST.includes(key)) {
      throw new Error(
        `realm.overrides.json sets "${key}", which is not in the allow-list of keys a realm override may change (${REALM_OVERRIDE_ALLOW_LIST.join(", ")})`
      );
    }
  }
}

/**
 * Merges an override on top of a template with es-toolkit `mergeWith` (D2-3): objects merge key by
 * key, and a list in the override replaces the whole list. The template is cloned first, so the
 * loaded template JSON is never mutated.
 */
function mergeOverrides(
  template: JsonObject,
  overrides: JsonObject
): JsonObject {
  return mergeWith(
    cloneDeep(template),
    overrides,
    (_targetValue, sourceValue) =>
      Array.isArray(sourceValue) ? sourceValue : undefined
  );
}

/** The one client of the representation by its id; the template must carry it (R-49a). */
function clientBy(realm: JsonObject, clientId: string): JsonObject {
  const clients = realm.clients;

  if (!Array.isArray(clients)) {
    throw new Error("the realm template carries no clients list");
  }

  const client = clients.find(
    (entry): entry is JsonObject =>
      isJsonObject(entry) && entry.clientId === clientId
  );

  if (client === undefined) {
    throw new Error(`the realm template carries no client "${clientId}"`);
  }

  return client;
}

/** Writes the values core owns into the merged representation (D2-3 step 3). */
export function fillRealmRepresentation(
  realm: JsonObject,
  fill: RealmFill
): JsonObject {
  realm.realm = fill.realm;
  realm.displayName = fill.displayName;

  const signIn = clientBy(realm, "genie-ops-center");
  signIn.secret = fill.clientSecret;
  signIn.redirectUris = [`${fill.publicUrl}${IDENTITY_CALLBACK_PATH}`];
  signIn.webOrigins = [fill.publicUrl];

  const attributes = signIn.attributes;

  const signInAttributes =
    attributes !== undefined && isJsonObject(attributes) ? attributes : {};

  signInAttributes["post.logout.redirect.uris"] = fill.publicUrl;
  signIn.attributes = signInAttributes;

  const admin = clientBy(realm, "genie-admin");
  admin.secret = fill.adminClientSecret;

  const smtpServer = realm.smtpServer;

  if (
    fill.smtp !== undefined &&
    smtpServer !== undefined &&
    isJsonObject(smtpServer)
  ) {
    const smtp = smtpServer;
    smtp.host = fill.smtp.host;
    smtp.port = fill.smtp.port;
    smtp.user = fill.smtp.username;
    smtp.password = fill.smtp.password;
    smtp.from = fill.smtp.from;
    smtp.ssl = fill.smtp.ssl ? "true" : "false";
    smtp.starttls = fill.smtp.starttls ? "true" : "false";

    if (fill.smtp.fromDisplayName !== undefined) {
      smtp.fromDisplayName = fill.smtp.fromDisplayName;
    }

    if (fill.smtp.replyTo !== undefined) {
      smtp.replyTo = fill.smtp.replyTo;
    }

    if (fill.smtp.replyToDisplayName !== undefined) {
      smtp.replyToDisplayName = fill.smtp.replyToDisplayName;
    }
  }

  return realm;
}

/**
 * The full build order of D2-3: check the override against the allow-list (and that it is an
 * object), merge the override onto the template, then fill the values core owns. The returned
 * object is a fresh clone, never the template the caller loaded.
 */
export function buildRealmRepresentation(
  template: JsonObject,
  overrides: JsonValue,
  fill: RealmFill
): JsonObject {
  checkRealmOverrides(overrides);

  return fillRealmRepresentation(mergeOverrides(template, overrides), fill);
}
