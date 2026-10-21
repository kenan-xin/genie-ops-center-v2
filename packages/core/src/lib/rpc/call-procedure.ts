import {
  createRouterClient,
  type InferRouterInitialContext,
} from "@orpc/server";

import type { ModuleRouter } from "./implement-module.ts";

/**
 * The one server-side caller: a typed client over a router, called in process with the given
 * request context and no HTTP. The procedure's whole pipeline runs, gates and input validation
 * included, and a thrown `AppError` reaches the caller unchanged. Server code and tests call
 * procedures through this, never through `@orpc/*` (ADR 0011).
 */
export function callProcedure<TRouter extends ModuleRouter>(
  router: TRouter,
  context: InferRouterInitialContext<TRouter>
) {
  return createRouterClient(router, { context });
}
