// The build-safe subpath, not the core root. The root re-exports the tenant
// context, which imports `pg` and `drizzle-orm/node-postgres`, and the
// configuration file is evaluated by the build and by every server start.
import { STANDARD_HEADERS } from "@genie/core/security";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hides the on-screen dev indicator. Next still reports compile and runtime errors.
  devIndicators: false,
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
  // `forbidden()` and `forbidden.tsx` are the framework's way to answer a page with 403. The proxy
  // rewrites a switched-off module's document to `/module-disabled`, which calls it, so the
  // refusal keeps its 403 (R-8) and renders the no-access state in the shell (6wz1.85).
  experimental: { authInterrupts: true },
  // The build type-checks shipped source only. Test files import module
  // packages the image builder stage prunes for a selection that excludes them
  // (pg4); the typecheck target still checks them through tsconfig.json.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // The root layout imports the default face with `?url` to preload it (R-10). `asset` emits the
  // same file that the font stylesheet references and returns its served URL. The query keeps the
  // rule off the stylesheet's own url() references, which it would otherwise leave unrewritten.
  turbopack: {
    rules: { "*.woff2": { condition: { query: "?url" }, type: "asset" } },
  },
  async headers() {
    // R-47 on every path. The viewer response replaces the policy in the proxy, and the setup
    // gate sets the same list on its own responses; one source in `@genie/core/security` keeps
    // them from drifting. Keeping the baseline on every other path means a proxy that failed to run
    // leaves frames denied instead of leaving no policy at all.
    //
    // The one exception is the download route, which sends `DOWNLOAD_POLICY` itself (DR-27). A
    // route cannot replace a header set here: Next.js copies a route header only when this list
    // did not set it (`server/send-response.js`). So the policy skips that path, both spellings.
    const policy = STANDARD_HEADERS.filter(
      ({ key }) => key === "Content-Security-Policy"
    );

    const others = STANDARD_HEADERS.filter(
      ({ key }) => key !== "Content-Security-Policy"
    );

    return [
      { source: "/(.*)", headers: others },
      { source: "/((?!api/files/download/?$).*)", headers: policy },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
