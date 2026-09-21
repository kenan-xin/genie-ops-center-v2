// Imports here decide what lands in the proxy bundle. The `@genie/core` root
// entry point re-exports the tenant context, which imports `pg` and
// `drizzle-orm/node-postgres`, so importing it would put the database driver in
// this bundle. The build-safe `@genie/core/security` subpath has no imports at
// all. Everything else the proxy needs, the provider map and the failure
// reporter, comes from the context slot, which the bootstrap filled.
import {
  type FrameOriginProvider,
  collectFrameOrigins,
  serializeContentSecurityPolicy,
} from "@genie/core/security";
import { type NextRequest, NextResponse } from "next/server.js";

import { readContext } from "./context.ts";
import { newRequestId } from "./request-id.ts";
import { viewerRouteFor } from "./viewer-routes.ts";

/** Pure, so the policy decision is testable without a request. */
export async function buildViewerPolicy<Ctx>(input: {
  provider: FrameOriginProvider<Ctx> | undefined;
  ctx: Ctx;
  report: (cause: unknown) => void;
}): Promise<string> {
  const origins = await collectFrameOrigins(input.provider, input.ctx, {
    onProviderError: input.report,
  });

  return serializeContentSecurityPolicy(origins);
}

/**
 * The standard headers, repeated here for responses the proxy creates itself.
 * The framework attaches nothing to a redirect it generates, and a redirect the
 * proxy returns replaces the response entirely, so these have to be set on it
 * (Amendment B).
 */
const STANDARD_HEADERS = [
  {
    key: "Content-Security-Policy",
    value:
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'",
  },
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

/** Every redirect the application owns, so each one is header-capable. */
const APPLICATION_REDIRECTS = new Map([["/home", "/"]]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Application redirects are emitted here, never through the framework's
  // redirect list, because that list produces a response with no headers at all.
  const destination = APPLICATION_REDIRECTS.get(pathname);

  if (destination !== undefined) {
    const redirect = NextResponse.redirect(
      new URL(destination, request.url),
      307
    );

    for (const { key, value } of STANDARD_HEADERS) {
      redirect.headers.set(key, value);
    }

    return redirect;
  }

  // The one request id for this request (R-44). It is minted here, set on the
  // response, and forwarded upstream, so the response header, the log line and
  // every handler's error body carry the same value. Handlers read this id
  // instead of minting their own, which is what previously left the two halves
  // of one request unjoinable.
  const requestId = newRequestId();

  // Forwarded upstream through `NextResponse.next`, which the framework
  // documents as the way to pass headers to a page, route or server action.
  // These headers are not sent to the client; the response header below is set
  // separately. Without this a handler sees no id and mints a second one.
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("x-request-id", requestId);

  const app = readContext();

  // Before the bootstrap publishes, no viewer route exists, so frames stay
  // denied by the baseline the header configuration already set.
  if (app === undefined) return response;

  // One line per request (R-44), carrying the context id. This is also what the
  // single-context acceptance check reads, so it must run on every request and
  // not only on the viewer path. The proxy is the only request logger: handlers
  // no longer write a line, so this count is exactly the request count.
  app.logRequest({ requestId, path: pathname });

  const route = viewerRouteFor(pathname, new Set(app.viewerProviders.keys()));

  // Ordinary documents, route handlers, health, assets and background requests
  // reach no provider at all, which is what R-49a counts.
  if (route === undefined) return response;

  const policy = await buildViewerPolicy({
    // Already wrapped with the invocation counter by the bootstrap, so a call
    // from any path is visible in the log that acceptance reads.
    provider: app.viewerProviders.get(route.moduleId),
    ctx: { tenant: app.tenant },
    report: (cause) =>
      // yt2: the failure is recorded with request correlation, through the
      // redacting logger the bootstrap built, and the policy stays denied.
      app.reportProviderFailure(cause, {
        moduleId: route.moduleId,
        requestId,
      }),
  });

  response.headers.set("Content-Security-Policy", policy);

  return response;
}
