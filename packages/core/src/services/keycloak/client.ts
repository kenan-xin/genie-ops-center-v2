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

/**
 * Creates a realm account through the `genie-admin` service client (`POST
 * /admin/realms/{realm}/users`, R-40) and answers the new account's Keycloak id, read from the
 * `Location` response header. Keycloak answers 201 with that header; a bodyless answer without one
 * is a refusal, because the caller needs the id for the follow-up action email.
 */
export async function createRealmUser(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  representation: JsonObject
): Promise<string> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/users`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(representation),
    }
  );

  const location = response.headers.get("location");
  await parseResponse(response);

  const id = location?.split("/").findLast((segment) => segment !== "");

  if (id === undefined || id === "") {
    throw new Error("Keycloak created the user without a Location id");
  }

  return id;
}

/**
 * Deletes a realm account (`DELETE /admin/realms/{realm}/users/{id}`, R-40). Add person uses it as
 * compensation when the Ops Center transaction fails after the realm user was created, so no
 * enabled realm account is left without a `user` row. A 404 is success: the account is gone.
 */
export async function deleteRealmUser(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  userId: string
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/users/${userId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );

  if (response.status === 404) return;

  await parseResponse(response);
}

/**
 * Triggers the realm's action email (`PUT /admin/realms/{realm}/users/{id}/execute-actions-email`,
 * R-40). The `UPDATE_PASSWORD` action sends Keycloak's set-password email; `lifespanSeconds` is
 * the link's own lifetime. Nothing here logs the link: the response is empty and the request body
 * carries no token beyond the access token.
 */
export async function executeActionsEmail(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  userId: string,
  actions: readonly string[],
  lifespanSeconds?: number
): Promise<void> {
  const url = new URL(
    `${target.baseUrl}/admin/realms/${realm}/users/${userId}/execute-actions-email`
  );

  if (lifespanSeconds !== undefined) {
    url.searchParams.set("lifespan", String(lifespanSeconds));
  }

  const response = await target.fetch(url.toString(), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(actions),
  });

  await parseResponse(response);
}

/**
 * The outcome of creating an identity provider: `exists` is a 409 for an alias already present,
 * which the caller turns into an update so a repeated `genie-ops idp set` is idempotent (R-58).
 */
export type IdentityProviderCreateOutcome = "created" | "exists";

/** Creates an identity provider in the realm (R-58). The representation is never logged. */
export async function createIdentityProvider(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  representation: JsonObject
): Promise<IdentityProviderCreateOutcome> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(representation),
    }
  );

  if (response.status === 409) return "exists";

  await parseResponse(response);

  return "created";
}

/** Replaces an existing identity provider, the idempotent half of {@link createIdentityProvider}. */
export async function updateIdentityProvider(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string,
  representation: JsonObject
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(representation),
    }
  );

  await parseResponse(response);
}

/**
 * Asks Keycloak itself to fetch and parse the provider's discovery document or SAML descriptor
 * (R-58). Keycloak, not this process, reaches the provider's metadata URL, which is the side that
 * talks to the provider anyway. The returned config map holds no secret.
 */
export async function importIdentityProviderConfig(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  providerId: string,
  fromUrl: string
): Promise<JsonObject> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/import-config`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ providerId, fromUrl }),
    }
  );

  const body = await parseResponse(response);

  if (!isObject(body)) {
    throw new Error("Keycloak returned no identity provider config");
  }

  return body;
}

/** One identity provider mapper as the list read exposes it; every field is optional. */
export type IdentityProviderMapper = {
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly identityProviderMapper: string | undefined;
};

/** Reads one identity provider, or nothing when the alias is absent. */
export async function readIdentityProvider(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string
): Promise<JsonObject | undefined> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  if (response.status === 404) return undefined;

  const body = await parseResponse(response);

  return isObject(body) ? body : {};
}

/** Lists the identity provider mappers of one provider, so a repeat can update the one it made. */
export async function listIdentityProviderMappers(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string
): Promise<readonly IdentityProviderMapper[]> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}/mappers`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  const body = await parseResponse(response);

  if (!Array.isArray(body)) return [];

  return body.filter(isObject).map((entry) => ({
    id: errorField(entry, "id"),
    name: errorField(entry, "name"),
    identityProviderMapper: errorField(entry, "identityProviderMapper"),
  }));
}

/** Adds the Attribute Importer mapper that fills the `groups` user attribute (R-58). */
export async function createIdentityProviderMapper(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string,
  mapper: JsonObject
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}/mappers`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mapper),
    }
  );

  await parseResponse(response);
}

/** Replaces one identity provider mapper by its id (idempotent rerun of `idp set`). */
export async function updateIdentityProviderMapper(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string,
  id: string,
  mapper: JsonObject
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}/mappers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mapper),
    }
  );

  await parseResponse(response);
}

/** One execution of the realm's browser flow, as the redirector lookup reads it. */
export type BrowserFlowExecution = {
  readonly id: string;
  readonly providerId: string | undefined;
  /** The authentication config id, `undefined` until the execution has one. */
  readonly authenticationConfig: string | undefined;
};

/** Lists one authentication flow's executions, for the redirector and the first-broker-login flow. */
export async function authenticationFlowExecutions(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  flowAlias: string
): Promise<readonly BrowserFlowExecution[]> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  const body = await parseResponse(response);

  if (!Array.isArray(body)) {
    throw new Error("Keycloak returned no browser flow executions");
  }

  return body.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const id = errorField(entry, "id");

    if (id === undefined) return [];

    return [
      {
        id,
        providerId: errorField(entry, "providerId"),
        authenticationConfig: errorField(entry, "authenticationConfig"),
      },
    ];
  });
}

/** Reads one authentication config, so the redirector's existing values survive the update. */
export async function readAuthenticationConfig(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  id: string
): Promise<JsonObject> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/authentication/config/${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  const body = await parseResponse(response);

  return isObject(body) ? body : {};
}

/** Writes an existing authentication config. */
export async function updateAuthenticationConfig(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  id: string,
  config: JsonObject
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/authentication/config/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(config),
    }
  );

  await parseResponse(response);
}

/** Creates the config of an execution that has none, which is how a fresh redirector starts. */
export async function createExecutionConfig(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  executionId: string,
  config: JsonObject
): Promise<void> {
  const response = await target.fetch(
    `${target.baseUrl}/admin/realms/${realm}/authentication/executions/${encodeURIComponent(executionId)}/config`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(config),
    }
  );

  await parseResponse(response);
}

export type AuthorizationProbe = {
  /** The HTTP status. 302 means the client answers; 400 otherwise. */
  readonly status: number;
  /** The Location header when the answer redirects, else nothing. */
  readonly location: string | undefined;
  /**
   * Keycloak's error-message text, or nothing when the page carries none. The text is in the
   * realm's locale, so a caller compares two probes rather than reading it.
   */
  readonly errorText: string;
};

/**
 * The RFC 7636 appendix B S256 challenge. A valid challenge value is required so Keycloak passes
 * the PKCE check and answers the `prompt=none` question instead of refusing the request.
 */
const PROBE_CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

/** The text of Keycloak's error page, read from the markup so the language does not matter. */
function errorTextOf(body: string): string {
  const match = /id="kc-error-message"[^>]*>\s*<p[^>]*>([^<]*)<\/p>/.exec(body);

  return match?.[1]?.trim() ?? "";
}

/**
 * Probes the public authorization endpoint for one client (R-54). With `genie-admin` holding no
 * `view-clients` role, this unauthenticated endpoint is the only signal for a client's existence
 * and its registered redirect URI. `prompt=none` makes a healthy client with no session redirect
 * to its registered URI with `error=login_required`; a client that does not exist answers a 400
 * whose error text differs from a client that exists but refuses the redirect.
 */
export async function probeAuthorization(
  target: KeycloakTarget,
  realm: string,
  clientId: string,
  redirectUri: string
): Promise<AuthorizationProbe> {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    code_challenge: PROBE_CODE_CHALLENGE,
    code_challenge_method: "S256",
    prompt: "none",
  }).toString();

  const response = await target.fetch(
    `${target.baseUrl}/realms/${realm}/protocol/openid-connect/auth?${query}`,
    { redirect: "manual" }
  );

  const body = await response.text();

  return {
    status: response.status,
    location: response.headers.get("location") ?? undefined,
    errorText: errorTextOf(body),
  };
}
