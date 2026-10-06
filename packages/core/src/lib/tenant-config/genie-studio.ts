/**
 * The optional `genie_studio_url` field of `tenant.yaml` (Spec 2 R-49a, R-53).
 *
 * genie-studio is the second product in the same realm (DEC-8). Its own product, genie-core,
 * completes the OIDC code exchange on a backend callback and signs out through the realm's
 * `end_session_endpoint`, so its Keycloak client needs the callback below as its redirect URI and
 * an origin wildcard as its post-logout redirect. This is the one place that contract is written
 * down for the managed realm; the client-only file keeps its own placeholder for the customer's IT.
 */

/** genie-core's OIDC callback path (`app/routes/routes.go`, `app/auth/oidc/service.go`). */
export const GENIE_STUDIO_CALLBACK_PATH = "/api/v1/auth/oidc/callback";

/** A loopback hostname, the only host a plain-http origin is allowed on (`PUBLIC_URL`, R-4a). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True for the origin `genie_studio_url` accepts (R-49a): an https origin, or an http origin on a
 * loopback host, with no userinfo, no path, no query and no fragment. The scheme rule is the
 * `PUBLIC_URL` one: plain HTTP is allowed only on loopback, where no other machine can reach it.
 */
export function isGenieStudioOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  if (url.username !== "" || url.password !== "") return false;

  if (url.search !== "" || url.hash !== "") return false;

  if (url.pathname !== "" && url.pathname !== "/") return false;

  if (url.protocol === "https:") return url.hostname !== "";

  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * The normalized origin of a `genie_studio_url`: lower-case scheme and host, the default port
 * removed, and the trailing slash the empty path leaves removed, which `URL.origin` already does.
 * The caller has validated the value with `isGenieStudioOrigin`; normalizing this way keeps
 * `https://Studio.example.com:443/` and `https://studio.example.com` the same origin.
 */
export function normalizeGenieStudioUrl(value: string): string {
  return new URL(value).origin;
}
