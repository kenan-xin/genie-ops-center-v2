import { implement } from "@orpc/server";

import {
  type ModuleContract,
  type ModuleImplementer,
  type ModuleRPCContext,
  requireAuthenticated,
} from "./implement-module.ts";

/**
 * The oRPC implementer of one of core's own areas (`audit`, `groups`, `people`, `roles`), with only
 * the session check attached through the implementer's own `.use()` (ADR 0011). Like
 * `implementModule`, the check counts toward the procedure's `inputValidationIndex`, so an
 * anonymous, idle-expired or capped request answers `unauthenticated` at 401 whatever its input
 * (Spec 2 R-14). There is no entitlement gate: a core area has no entitlement row, and the reader
 * answers disabled for an id without one.
 *
 * An area adds its permission gate with `.use()` on the answer, which also runs before input
 * validation, so a caller without the key is refused `forbidden` however malformed the input is.
 * A `.use()` on one procedure (`os.<procedure>.use()`) runs after validation instead.
 */
export function implementCoreArea<TContract extends ModuleContract>(
  contract: TContract
): ModuleImplementer<TContract> {
  // Typed as an empty contract router, as in `implementModule`, so `.use` is callable for a
  // generic contract; the return type restores the real one.
  const implementer = implement<Record<never, never>, ModuleRPCContext>(
    contract
  ).use(({ context, next }) => {
    requireAuthenticated(context.caller, context.requestId);

    return next();
  });

  // SAFETY: `implementer` is oRPC's implementer of `contract` with one context-preserving
  // middleware attached, which is exactly `ModuleImplementer<TContract>`.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the empty-contract type above and the caller's contract type do not overlap, by construction.
  return implementer as unknown as ModuleImplementer<TContract>;
}
