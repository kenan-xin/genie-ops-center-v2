// Imports here decide what lands in the proxy bundle. The `@genie/core` root
// entry point re-exports the tenant context, which imports `pg` and
// `drizzle-orm/node-postgres`, so importing it would put the database driver in
// this bundle. The build-safe `@genie/core/security` and `@genie/core/errors`
// subpaths import nothing at all. Everything else the proxy needs, the module
// route map, the provider map and the failure reporter, comes from the context
// slot, which the bootstrap filled.
import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";

import { AppError, CORE_ERRORS, safeBodyFor } from "@genie/core/errors";
import {
  STANDARD_HEADERS,
  type FrameOriginProvider,
  collectFrameOrigins,
  serializeContentSecurityPolicy,
} from "@genie/core/security";
import { type NextRequest, NextResponse } from "next/server.js";

import { readContext } from "./context.ts";
import { moduleRouteOwner } from "./module-paths.ts";
import { newRequestId } from "./request-id.ts";
import { SETUP_REQUIRED_HEADER } from "./setup-required-header.ts";
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
 * The standard headers (R-47) live once, in `@genie/core/security`, so this proxy and
 * `next.config.ts` cannot drift. The framework attaches nothing to a redirect or a refusal the
 * proxy creates itself — such a response replaces the one the header configuration would
 * decorate — so the proxy sets them here (Amendment B; the setup gate keeps the same headers on
 * every response it creates).
 */
function applyStandardHeaders(response: NextResponse, requestId: string): void {
  for (const { key, value } of STANDARD_HEADERS) {
    response.headers.set(key, value);
  }

  response.headers.set("x-request-id", requestId);
}

/**
 * The public files the running image actually serves, listed once at module load. Membership is an
 * exact location-and-existence test, never a suffix: a suffix rule exempted any path ending in
 * `.json` or `.js`, and a tRPC batch path such as `/api/trpc/placeholder.read,x.json` then ran a
 * procedure before setup (finding 1). The process runs from the application root — the standalone
 * server chdirs to its own directory, and `next dev` starts in the project — so `public/` resolves
 * in both. A missing directory is an empty set, not a startup failure.
 */
function listPublicFiles(): ReadonlySet<string> {
  const files = new Set<string>();

  const walk = (directory: string, prefix: string): void => {
    let entries: Dirent[];

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

      if (entry.isDirectory()) {
        walk(join(directory, entry.name), relative);
      } else {
        files.add(`/${relative}`);
      }
    }
  };

  walk(join(process.cwd(), "public"), "");

  return files;
}

const PUBLIC_FILES = listPublicFiles();

/**
 * R-80: while the gate is unsatisfied, only health and the static assets the not-set-up page needs
 * keep serving. Every path under `/api/` other than health refuses whatever it is named, and the
 * framework's static locations are named exactly — a bare `/_next/` prefix sent
 * `/_next/not-a-real-static-asset.js` to the framework not-found page, which rendered the root
 * layout with the full catalogue before setup (findings 1 and 2).
 */
function isGateExempt(pathname: string): boolean {
  if (pathname === "/api/health") return true;

  if (pathname.startsWith("/api/")) return false;

  if (pathname.startsWith("/_next/static/")) return true;

  if (pathname.startsWith("/_next/image")) return true;

  return PUBLIC_FILES.has(pathname);
}

/**
 * R-80, D-14: while the gate is unsatisfied, an API surface that would answer refuses, and a
 * gate read that failed answers the same way. One generic 503 body serves both on purpose: it
 * must not distinguish an unfinished setup from a database outage, so neither leaks a database
 * message and a set-up deployment is never reported as not set up.
 */
function unavailableResponse(requestId: string): NextResponse {
  const unavailable = new NextResponse("unavailable", { status: 503 });

  applyStandardHeaders(unavailable, requestId);

  return unavailable;
}

/**
 * D-2: a RSC or prefetch request gets no page body while the gate is unsatisfied. A full document
 * navigation is the one request class that carries none of the framework's flight or prefetch
 * headers, which `isBackgroundRequest` decides.
 */
function emptyBackgroundResponse(requestId: string): NextResponse {
  const empty = new NextResponse(null, { status: 200 });

  applyStandardHeaders(empty, requestId);

  return empty;
}

/**
 * D-2: every document route shows the one not-set-up page. The proxy rewrites to the
 * `setup-required` route, which renders it at the original URL, so R-16 holds for a route the
 * image knows and for one it does not, without the framework rendering any shell first.
 */
function notSetUpPageResponse(
  request: NextRequest,
  requestId: string
): NextResponse {
  const target = request.nextUrl.clone();

  target.pathname = "/setup-required";
  target.search = "";

  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-request-id", requestId);
  // The root layout reads this and withholds the message catalogue, so the standalone page shows
  // no shell strings (R-16).
  requestHeaders.set(SETUP_REQUIRED_HEADER, "1");

  const response = NextResponse.rewrite(target, {
    request: { headers: requestHeaders },
  });

  applyStandardHeaders(response, requestId);

  return response;
}

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

  applyStandardHeaders(refusal, requestId);

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

    // The id reaches the client on the redirect too, so a redirect and any log
    // line or error body about it share one value.
    applyStandardHeaders(redirect, requestId);

    return redirect;
  }

  // Forwarded upstream through `NextResponse.next`, which the framework
  // documents as the way to pass headers to a page, route or server action.
  // These headers are not sent to the client; the response header below is set
  // separately. Without this a handler sees no id and mints a second one.
  const requestHeaders = new Headers(request.headers);

  // The proxy is the only writer of this header. A client that sends it cannot make the layout
  // withhold the catalogue on a set-up deployment; the rewrite branch sets it when (and only
  // when) it serves the not-set-up page (finding 4).
  requestHeaders.delete(SETUP_REQUIRED_HEADER);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("x-request-id", requestId);

  // Before the bootstrap publishes, no viewer route exists, so frames stay
  // denied by the baseline the header configuration already set.
  if (app === undefined) return response;

  // D-2: the setup gate runs before the module-disabled guard, so an unfinished deployment shows
  // the not-set-up page whatever the route would otherwise do. Static assets and health are the
  // only surfaces R-80 keeps serving, so the gate never even reads `setup_step` for them.
  if (!isGateExempt(pathname)) {
    let satisfied: boolean;

    try {
      satisfied = await app.setupGate.isSatisfied();
    } catch {
      return unavailableResponse(requestId);
    }

    if (!satisfied) {
      // R-80: no tRPC procedure, no inbound endpoint under `/api/m/` and no authentication route
      // answers. This is checked before the background branch, so an `/api/` request carrying an
      // RSC header refuses instead of reading as a 200 success (finding 6).
      if (pathname.startsWith("/api/")) {
        return unavailableResponse(requestId);
      }

      // RSC and prefetch requests carry no page body while the gate is unsatisfied (D-2).
      if (isBackgroundRequest(request.headers)) {
        return emptyBackgroundResponse(requestId);
      }

      return notSetUpPageResponse(request, requestId);
    }
  }

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
