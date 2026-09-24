// Imports here decide what lands in the proxy bundle. The `@genie/core` root
// entry point re-exports the tenant context, which imports `pg` and
// `drizzle-orm/node-postgres`, so importing it would put the database driver in
// this bundle. The build-safe `@genie/core/security` and `@genie/core/errors`
// subpaths import nothing at all. Everything else the proxy needs, the module
// route map, the provider map and the failure reporter, comes from the context
// slot, which the bootstrap filled.
import { AppError, CORE_ERRORS, safeBodyFor } from "@genie/core/errors";
import {
  BASELINE_POLICY,
  type FrameOriginProvider,
  collectFrameOrigins,
  serializeContentSecurityPolicy,
} from "@genie/core/security";
import { type NextRequest, NextResponse } from "next/server.js";

import { readContext } from "./context.ts";
import { moduleRouteOwner } from "./module-paths.ts";
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
    value: BASELINE_POLICY,
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

/**
 * R-8: the refusal for a declared route whose module is switched off. It carries the catalogue
 * code, its fixed safe message and this request's id, at HTTP 403, so it reads exactly like the
 * tRPC gate's refusal and the ordinary route helper's body. The module stays mounted; it refuses
 * rather than disappearing, which is what keeps it distinguishable from an excluded module whose
 * route does not exist.
 */
function moduleDisabledResponse(requestId: string): NextResponse {
  const body = safeBodyFor(
    new AppError(CORE_ERRORS["module-disabled"]),
    requestId
  );

  const refusal = NextResponse.json(body, { status: 403 });

  for (const { key, value } of STANDARD_HEADERS) {
    refusal.headers.set(key, value);
  }

  refusal.headers.set("x-request-id", requestId);

  return refusal;
}

/**
 * The framework's flight headers. Next 16 attaches one or more of these to every
 * router flight, prefetch or HMR-refresh request, and a full document navigation
 * to the same URL carries none of them, so their absence is the document test
 * R-49 and R-49a need. Names verified against the installed next 16.3.5
 * `client/components/app-router-headers.js`.
 */
const BACKGROUND_HEADERS = [
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-hmr-refresh",
] as const;

/** `purpose: prefetch` / `sec-purpose: prefetch` name a background request. */
function namesBackgroundPurpose(value: string | null): boolean {
  if (value === null) return false;

  return value
    .toLowerCase()
    .split(",")
    .some((part) => {
      const directive = part.split(";")[0]?.trim();

      return directive === "prefetch" || directive === "prerender";
    });
}

/** True for a router flight or prefetch request; false for a document request. */
function isBackgroundRequest(headers: Headers): boolean {
  return (
    BACKGROUND_HEADERS.some((name) => headers.has(name)) ||
    namesBackgroundPurpose(headers.get("purpose")) ||
    namesBackgroundPurpose(headers.get("sec-purpose"))
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // The one request id for this request (R-44). It is minted before the redirect
  // branch, because a redirect is a request like any other and R-44 counts one
  // line for it too. Minting it after the branch left `/home` with zero lines.
  const requestId = newRequestId();

  const app = readContext();

  // One line per request (R-44), carrying the context id. It runs for every
  // request class, the application redirect included, so "one line per request"
  // is true literally rather than only for the paths that reach a handler. The
  // proxy is the only request logger: handlers no longer write a line, so this
  // count is exactly the request count.
  app?.logRequest({ requestId, path: pathname });

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

    // The id reaches the client on the redirect too, so a redirect and any log
    // line or error body about it share one value.
    redirect.headers.set("x-request-id", requestId);

    return redirect;
  }

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

  // Before the bootstrap publishes, no viewer route exists, so frames stay
  // denied by the baseline the header configuration already set.
  if (app === undefined) return response;

  // R-8: a declared route or a viewer document whose module is switched off
  // refuses before its page renders and before any frame-origin provider runs.
  // The entitlement reader answers disabled for a compiled module with no row,
  // so this also covers a module that has not been through the seed step; an
  // excluded module's path was never declared and falls through to the
  // framework's own not-found, which keeps the two cases distinguishable.
  const owner =
    moduleRouteOwner(pathname, app.moduleRoutes) ??
    viewerRouteFor(pathname, new Set(app.viewerProviders.keys()))?.moduleId;

  if (
    owner !== undefined &&
    !(await app.tenant.entitlements.isEnabled(owner))
  ) {
    return moduleDisabledResponse(requestId);
  }

  // R-49a: a background navigation request must not invoke a provider either,
  // whatever the pathname. A full document navigation is the one request class
  // that carries none of the framework's flight or prefetch headers, so it is
  // the only one that reaches the provider below; the background request keeps
  // the deny baseline the header configuration already set.
  if (isBackgroundRequest(request.headers)) return response;

  const route = viewerRouteFor(pathname, new Set(app.viewerProviders.keys()));

  // Ordinary documents, route handlers, health and assets reach no provider at
  // all, which is what R-49a counts.
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
