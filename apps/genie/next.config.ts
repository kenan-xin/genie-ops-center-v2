// The build-safe subpath, not the core root. The root re-exports the tenant
// context, which imports `pg` and `drizzle-orm/node-postgres`, and the
// configuration file is evaluated by the build and by every server start.
import { STANDARD_HEADERS } from "@genie/core/security";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  // The build type-checks shipped source only. Test files import module
  // packages the image builder stage prunes for a selection that excludes them
  // (pg4); the typecheck target still checks them through tsconfig.json.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  async headers() {
    // R-47 on every path. The viewer response replaces the policy in the proxy, and the setup
    // gate sets the same list on its own responses; one source in `@genie/core/security` keeps
    // them from drifting. Keeping the baseline on every path means a proxy that failed to run
    // leaves frames denied instead of leaving no policy at all.
    return [{ source: "/(.*)", headers: [...STANDARD_HEADERS] }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
