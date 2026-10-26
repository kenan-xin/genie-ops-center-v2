import { AppError, CORE_ERRORS, type RequestPrincipal } from "@genie/core";
import type { RPCHandler } from "@orpc/server/fetch";

import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../app/api/request-origin.ts";
import { type AppContext, CONTEXT_HEADER } from "../context.ts";
import { errorResponse } from "../http-errors.ts";
import { newRequestId } from "../request-id.ts";
import { RPC_PREFIX, type RequestContext } from "./handler.ts";

/**
 * The largest request body `/api/rpc` reads (DR-23): the 1 MB branding image of R-49 with its
 * multipart overhead, and room to spare. A larger body is refused before oRPC parses it, so no
 * caller, signed in or not, makes oRPC decode one (DEC-44). Next.js has still read it by then:
 * while `proxy.ts` runs, the framework buffers up to `proxyClientMaxBodySize` of every body.
 */
const RPC_BODY_MAX_BYTES = 2 * 1024 * 1024;

/**
 * True for a body declared over the cap, or for a multipart body that declares no length, whose
 * size is unknown until it is read. Only the headers are read. A media type ignores case, so any
 * spelling of multipart counts.
 */
function bodyTooLarge(request: Request): boolean {
  const declared = request.headers.get("content-length");

  if (declared !== null) return Number(declared) > RPC_BODY_MAX_BYTES;

  return (
    request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/") ?? false
  );
}

/**
 * Answers one `/api/rpc` request. The route exports only `POST`, so a `GET` never reaches here
 * (decision 5). The order is fixed: the body-size guard first, then the origin check, then the
 * procedure inside the request's correlation scope, then the context header on whatever answer
 * leaves.
 */
export async function serveRpc(input: {
  readonly request: Request;
  readonly app: AppContext;
  readonly handler: RPCHandler<RequestContext>;
  /** One principal per request, never shared (R-27). */
  readonly principal: () => Promise<RequestPrincipal>;
}): Promise<Response> {
  const { request, app } = input;

  // The proxy is the one request logger (R-44) and it forwards its id upstream, so this reads
  // that id rather than minting a second one. The fallback keeps a direct invocation working.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();

  const response = await answer({ ...input, requestId });

  // AC-26, across real bundles: this header is written by the route-handler bundle from the
  // context it read, never by the proxy, so a second context here shows up as a second id.
  response.headers.set(CONTEXT_HEADER, app.contextId);

  return response;
}

async function answer(input: {
  readonly request: Request;
  readonly app: AppContext;
  readonly handler: RPCHandler<RequestContext>;
  readonly principal: () => Promise<RequestPrincipal>;
  readonly requestId: string;
}): Promise<Response> {
  const { request, app, requestId } = input;

  // DR-23: decided from the headers alone, so a refused body is never read or parsed.
  if (bodyTooLarge(request))
    return errorResponse(
      new AppError(CORE_ERRORS["request-too-large"]),
      requestId
    );

  // Every procedure call is a POST, so every one is a state change for the CSRF boundary.
  if (!stateChangeOriginAllowed(request, app.tenant.env.publicUrl))
    return crossOriginRefusal();

  // The principal is read before the handler runs, so its error interceptor never sees a failed
  // session read. The failure is logged and answered here with the same id (R-46, AC-15).
  let caller: RequestPrincipal;

  try {
    caller = await input.principal();
  } catch (cause) {
    app.logError(cause, { requestId });

    return errorResponse(cause, requestId);
  }

  // The correlation scope holds this request's id for the whole procedure, so an event a
  // procedure emits inherits it (module-contract.md, "every event carries a correlation id").
  const result = await app.tenant.correlationScope.run(requestId, async () =>
    input.handler.handle(request, {
      prefix: RPC_PREFIX,
      // A fresh object per request: the error interceptor keys its per-request mark on it.
      context: {
        requestId,
        // The one tenant context the bootstrap published (DEC-34).
        tenant: app.tenant,
        // An anonymous, idle-expired or capped session yields an unauthenticated principal that
        // a protected procedure refuses at 401 (Spec 2 R-14).
        caller,
      },
    })
  );

  if (result.matched) return result.response;

  // An unknown procedure path answers the catalogue not-found body with the request id.
  return errorResponse(new AppError(CORE_ERRORS["not-found"]), requestId);
}
