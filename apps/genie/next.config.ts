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
  async headers() {
    return [{ source: "/(.*)", headers: STANDARD_HEADERS }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
