/**
 * The hostnames a plain-http URL is allowed on (Spec 2 R-4a). A single list, imported by the
 * `PUBLIC_URL` check in `lib/environment` and by the `genie_studio_url` check in `lib/tenant-config`,
 * so the two rules cannot drift. No other host may reach a loopback address.
 */
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
