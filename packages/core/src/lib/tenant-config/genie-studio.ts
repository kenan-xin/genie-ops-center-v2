/**
 * The optional `genie_studio_url` field of `tenant.yaml` (Spec 2 R-49a, R-53).
 *
 * genie-studio is the second product in the same realm (DEC-8). Its own product, genie-core,
 * completes the OIDC code exchange on a backend callback and signs out through the realm's
 * `end_session_endpoint`, so its Keycloak client needs the callback below as its redirect URI and
 * an origin wildcard as its post-logout redirect. This is the one place that contract is written
 * down for the managed realm; the client-only file keeps its own placeholder for the customer's IT.
 */

import { LOOPBACK_HOSTS } from "../../utils/loopback-hosts.ts";

/** genie-core's OIDC callback path (`app/routes/routes.go`, `app/auth/oidc/service.go`). */
export const GENIE_STUDIO_CALLBACK_PATH = "/api/v1/auth/oidc/callback";

/** The origin-shape message, shared by every rejection that is not a wildcard host or port 0. */
const ORIGIN_MESSAGE =
  "genie_studio_url must be an https origin, or an http origin on loopback, with no userinfo, path, query or fragment";

/**
 * The named problem with a `genie_studio_url`, or `undefined` when it is valid (R-49a): an https
 * origin, or an http origin on a loopback host, with no userinfo, no path, no query, no fragment,
 * no wildcard host and no port 0. Keycloak matches the redirect host and port literally, so a
 * wildcard or port 0 makes a client that cannot sign anyone in.
 */
export function genieStudioUrlProblem(value: string): string | undefined {
  if (!URL.canParse(value)) return ORIGIN_MESSAGE;

  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:")
    return ORIGIN_MESSAGE;

  if (url.username !== "" || url.password !== "") return ORIGIN_MESSAGE;

  if (url.search !== "" || url.hash !== "") return ORIGIN_MESSAGE;

  if (url.pathname !== "" && url.pathname !== "/") return ORIGIN_MESSAGE;

  if (url.hostname.includes("*")) {
    return "genie_studio_url must not use a wildcard host";
  }

  if (url.port === "0") return "genie_studio_url must not use port 0";

  if (url.protocol === "https:") {
    return url.hostname === "" ? ORIGIN_MESSAGE : undefined;
  }

  return LOOPBACK_HOSTS.has(url.hostname) ? undefined : ORIGIN_MESSAGE;
}

/**
 * The normalized origin of a `genie_studio_url`: lower-case scheme and host, the default port
 * removed, and the trailing slash the empty path leaves removed, which `URL.origin` already does.
 * The caller has validated the value with `genieStudioUrlProblem`; reducing this way keeps
 * `https://Studio.example.com:443/` and `https://studio.example.com` the same origin.
 */
export function normalizeGenieStudioUrl(value: string): string {
  return new URL(value).origin;
}
