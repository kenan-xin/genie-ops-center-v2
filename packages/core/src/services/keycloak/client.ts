import type { JsonObject, JsonValue } from "./representation.ts";

/**
 * The Keycloak admin REST calls the realm and clients steps make, over the image's native `fetch`
 * (Node 26). Nothing here logs a realm representation or a secret: an error carries the HTTP
 * status and the error fields Keycloak returns, never the request or response body.
 */

export type KeycloakTarget = {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
};

function isObject(value: JsonValue): value is JsonObject {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed JSON value is object or not; this is the discriminator.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The one string field of an error body, or nothing when the field is absent or not a string. */
function errorField(object: JsonObject, key: string): string | undefined {
  const value = object[key];

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- an error body field is a string or not; this is the discriminator.
  return typeof value === "string" ? value : undefined;
}

/**
 * Parses a response and refuses with a message built only from the status and the safe error
 * fields Keycloak returns (`error`, `errorMessage`, `error_description`). The raw body is never
 * echoed, because a create-realm refusal can carry the representation it rejected.
 */
async function parseResponse(response: Response): Promise<JsonValue> {
  const text = await response.text();

  let body: JsonValue | undefined;

  try {
    // SAFETY: the response body is JSON text, which is exactly a JsonValue.
    body = text === "" ? undefined : (JSON.parse(text) as JsonValue);
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const detail = body !== undefined && isObject(body) ? body : {};

    const pieces = [
      `HTTP ${response.status}`,
      errorField(detail, "error"),
      errorField(detail, "errorMessage") ??
        errorField(detail, "error_description"),
    ].filter((piece): piece is string => piece !== undefined);

    throw new Error(`Keycloak refused the request (${pieces.join(": ")})`);
  }

  return body ?? {};
}

/** Exchanges a token over the token endpoint and returns its access token. */
async function token(
  target: KeycloakTarget,
  realm: string,
  params: Readonly<Record<string, string>>
): Promise<string> {
  const response = await target.fetch(
    `${target.baseUrl}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    }
  );

  const body = await parseResponse(response);

  const accessToken = isObject(body)
    ? errorField(body, "access_token")
    : undefined;

  if (accessToken === undefined) {
    throw new Error("Keycloak returned no access_token");
  }

  return accessToken;
}

/** Signs in to the `master` realm with the one-run bootstrap credential (DEC-37). */
export function masterAdminToken(
  target: KeycloakTarget,
  username: string,
  password: string
): Promise<string> {
  return token(target, "master", {
    grant_type: "password",
    client_id: "admin-cli",
    username,
    password,
  });
}

/** Obtains a realm-scoped token for a service account (the `genie-admin` client). */
export function serviceAccountToken(
  target: KeycloakTarget,
  realm: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  return token(target, realm, {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
}

/** True when a realm of that name already exists on the server. */
export async function realmExists(
  target: KeycloakTarget,
  realm: string,
  accessToken: string
): Promise<boolean> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );

  if (response.status === 404) return false;

  await parseResponse(response);

  return true;
}

/** Creates the realm in one `POST /admin/realms` (D2-3). The representation is never logged. */
export async function createRealm(
  target: KeycloakTarget,
  accessToken: string,
  representation: JsonObject
): Promise<void> {
  const response = await target.fetch(`${target.baseUrl}/admin/realms`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(representation),
  });

  await parseResponse(response);
}

export type KeycloakClient = {
  readonly id: string;
  readonly clientId: string;
  readonly redirectUris: readonly string[];
};

/** Lists the clients of a realm, optionally filtered by client id (R-54). */
export async function listClients(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  clientId?: string
): Promise<readonly KeycloakClient[]> {
  const query =
    clientId === undefined ? "" : `?clientId=${encodeURIComponent(clientId)}`;

  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/clients${query}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  const body = await parseResponse(response);

  if (!Array.isArray(body)) return [];

  return body.filter(isObject).map((client) => ({
    id: String(client.id ?? ""),
    clientId: String(client.clientId ?? ""),
    redirectUris: Array.isArray(client.redirectUris)
      ? client.redirectUris.map(String)
      : [],
  }));
}
