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
