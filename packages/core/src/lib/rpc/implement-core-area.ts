import { implement } from "@orpc/server";

import { can } from "../../services/authorization/index.ts";
import { AppError, CORE_ERRORS } from "../errors/index.ts";
import type { PermissionKey } from "../module-contract/keys.ts";
import {
  type ModuleContract,
  type ModuleImplementer,
  type ModuleRPCContext,
  requireAuthenticated,
} from "./implement-module.ts";

/**
 * The oRPC implementer of one of core's own areas (`audit`, `groups`, `people`, `roles`, `modules`, `categories`, `settings`, `branding`), with only
 * the session check attached through the implementer's own `.use()` (ADR 0011). Like
 * `implementModule`, the check counts toward the procedure's `inputValidationIndex`, so an
 * anonymous, idle-expired or capped request answers `unauthenticated` at 401 whatever its input
 * (Spec 2 R-14). There is no entitlement gate: a core area has no entitlement row, and the reader
 * answers disabled for an id without one.
 *
 * An area whose every procedure needs one key builds its implementer with `gatedArea` instead. A
 * `.use()` on one procedure (`os.<procedure>.use()`) runs after validation, so a per-procedure check
 * belongs inside the handler.
 */
export function implementCoreArea<TContract extends ModuleContract>(
  contract: TContract
): ModuleImplementer<TContract> {
  // SAFETY: `sessionChecked` is oRPC's implementer of `contract` with one context-preserving
  // middleware attached, which is exactly `ModuleImplementer<TContract>`.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the empty-contract type above and the caller's contract type do not overlap, by construction.
  return sessionChecked(contract) as unknown as ModuleImplementer<TContract>;
}

/**
 * The implementer of a core area behind one permission: the session check, then the `can()` gate,
 * both before input validation, so a caller without `permission` is refused `forbidden` at 403
 * however malformed the input is (Spec 2 R-14, R-37, DEC-39). A further gate (`.use()` on the
 * answer) also runs before validation.
 */
export function gatedArea<TContract extends ModuleContract>(
  contract: TContract,
  permission: PermissionKey
): ModuleImplementer<TContract> {
  const implementer = sessionChecked(contract).use(
    async ({ context, next }) => {
      if (!(await can(context.caller, permission))) {
        throw new AppError(CORE_ERRORS.forbidden);
      }

      return next();
    }
  );

  // SAFETY: as in `implementCoreArea`, with one more context-preserving middleware.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the empty-contract type above and the caller's contract type do not overlap, by construction.
  return implementer as unknown as ModuleImplementer<TContract>;
}

/**
 * One instance for every core area, so a router built from `implementCoreArea` over procedures of
 * several `gatedArea` implementers (People's picker) dedupes it instead of running it twice.
 */
const sessionCheck = implement<Record<never, never>, ModuleRPCContext>(
  {}
).middleware(({ context, next }) => {
  requireAuthenticated(context.caller, context.requestId);

  return next();
});

/**
 * Typed as an empty contract router, as in `implementModule`, so `.use` is callable for a generic
 * contract; the callers restore the real type.
 */
function sessionChecked(contract: ModuleContract) {
  return implement<Record<never, never>, ModuleRPCContext>(contract).use(
    sessionCheck
  );
}
