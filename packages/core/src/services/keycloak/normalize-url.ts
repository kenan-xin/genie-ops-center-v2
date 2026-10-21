/**
 * The normalized form of a Keycloak base URL (Spec 2 R-54c): lower-case scheme and host, the
 * default port removed, and the trailing slash removed. The stored value and `KEYCLOAK_URL` are
 * compared after this normalization, so `https://ID.example.com:443/` and `https://id.example.com`
 * compare equal.
 *
 * The scheme and host are lower-cased and the default port is dropped by `URL` itself; this only
 * strips the trailing slash the empty path leaves.
 */
export function normalizeKeycloakUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("KEYCLOAK_URL must be an http:// or https:// url");
  }

  return url.toString().replace(/\/$/, "");
}
