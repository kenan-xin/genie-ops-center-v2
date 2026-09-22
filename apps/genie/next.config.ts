// The build-safe subpath, not the core root. The root re-exports the tenant
// context, which imports `pg` and `drizzle-orm/node-postgres`, and the
// configuration file is evaluated by the build and by every server start.
import { BASELINE_POLICY } from "@genie/core/security";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * R-47 on every path. The viewer response replaces this policy in the proxy,
 * which the measurement showed replaces rather than duplicates. Keeping the
 * baseline on every path means a proxy that failed to run leaves frames denied
 * instead of leaving no policy at all.
 */
const STANDARD_HEADERS = [
  { key: "Content-Security-Policy", value: BASELINE_POLICY },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The framework's own trailing-slash redirect carries no headers at all, so
  // removing it makes both spellings of a route ordinary responses with full
  // coverage (R-47, as amended 2026-09-21).
  skipTrailingSlashRedirect: true,
  // R-49a counts zero provider calls on background navigation requests, but the
  // real proxy boundary is not the raw request: `server/web/adapter.js` deletes
  // Next's internal flight headers (`rsc`, `next-router-prefetch`, and the rest
  // of FLIGHT_HEADERS) before the proxy runs unless this is set. Only the
  // supported flag can expose them, and the classification in proxy.ts depends
  // on seeing them. It changes nothing else that matters here: filesystem
  // routing, `redirects` and `rewrites` are untouched, and the 308
  // repeated-slash/backslash normalization still runs in `base-server` before
  // any proxy code.
  skipProxyUrlNormalize: true,
  async headers() {
    return [{ source: "/(.*)", headers: STANDARD_HEADERS }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
