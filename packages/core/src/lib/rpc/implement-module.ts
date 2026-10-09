import type { AnyContractRouter } from "@orpc/contract";
import {
  type AnyRouter,
  implement,
  type ImplementerInternalWithMiddlewares,
  type Router,
} from "@orpc/server";

import { AppError, CORE_ERRORS } from "../errors/index.ts";
import type { ModuleRequestContext } from "../module-contract/module.ts";

/** What a module's `contract.ts` declares: an oRPC contract router built with `oc`. */
export type ModuleContract = AnyContractRouter;

/** What `implementModule` answers: the contract's implementer, gates attached. */
export type ModuleImplementer<TContract extends ModuleContract> =
  ImplementerInternalWithMiddlewares<
    TContract,
    ModuleRPCContext,
    ModuleRPCContext
  >;

/** What `implementModule(id, contract).router(...)` builds. */
export type ModuleRouter = AnyRouter;

/**
 * What a module procedure reads: the module contract's request context plus the request id the
 * application attaches for R-46 correlation. The id is optional because a module may be exercised
 * outside the application, where no request id exists; the application always supplies one.
 */
export type ModuleRPCContext = ModuleRequestContext & {
  readonly requestId?: string;
};

/**
 * The session check every protected procedure runs before it parses input or reads a resource
 * (Spec 2 R-14, R-46). A request with no valid session - anonymous, idle-expired, or past its
 * absolute cap - is answered the catalogue `unauthenticated` at 401. `can()` still refuses an
 * anonymous caller exactly as before; this only names the condition earlier, so a malformed input
 * cannot pre-empt it.
 */
export function requireAuthenticated(
  caller: { readonly authenticated: boolean },
  requestId?: string
): void {
  if (caller.authenticated) return;

  throw new AppError(
    CORE_ERRORS.unauthenticated,
    requestId === undefined ? {} : { requestId }
  );
}

type RouterOwner = {
  readonly id: string;
  readonly contract: ModuleContract;
  /** The entitlement gate and the session check, in run order: every router procedure starts with them. */
  readonly gates: readonly unknown[];
};

const routerOwners = new WeakMap<ModuleRouter, RouterOwner>();

/**
 * The module id and contract a router was built for by `implementModule`, or `undefined` for a
 * router core did not build. Module validation reads this to tie a router to its declaration.
 */
export function ownerOfRouter(router: ModuleRouter): RouterOwner | undefined {
  return routerOwners.get(router);
}

/**
 * R-8, the per-procedure half (d1y): the oRPC implementer of a module's contract, built against the
 * module request context, with the entitlement gate and then the session check attached through
 * the implementer's own `.use()`. Middleware attached there counts toward the procedure's
 * `inputValidationIndex`, so with the default `initialInputValidationIndex` of 0 both run before
 * any input is parsed: a disabled module answers `module-disabled`, and an anonymous caller
 * `unauthenticated`, whatever the input. `.router()` repeats both, and the default
 * `dedupeLeadingMiddlewares` keeps them to one run each.
 *
 * The gate reads only the entitlement reader and the request id: switching a module off is a
 * deployment decision, not a permission (DEC-39). Every router `.router()` builds is recorded
 * under `{ id, contract, gates }`, so validation refuses a module whose router was built elsewhere,
 * for another module, or from another contract, and any procedure that does not start with the
 * gates. A root `.use()` or `.lazy()` throws: the gates are core's, and a lazy router would hide
 * its procedures from that check.
 */
export function implementModule<TContract extends ModuleContract>(
  moduleId: string,
  contract: TContract
): ModuleImplementer<TContract> {
  // Typed as an empty contract router here: for a generic contract oRPC's implementer type stays
  // an unresolved procedure-or-router union, so `.use` would not be callable. The runtime value
  // is built from the real contract, and the return type restores it below.
  const base = implement<Record<never, never>, ModuleRPCContext>(contract);

  const entitlementGate = base.middleware(async ({ context, next }) => {
    if (!(await context.tenant.entitlements.isEnabled(moduleId))) {
      const { requestId } = context;

      throw new AppError(
        CORE_ERRORS["module-disabled"],
        requestId === undefined ? {} : { requestId }
      );
    }

    return next();
  });

  const sessionCheck = base.middleware(({ context, next }) => {
    requireAuthenticated(context.caller, context.requestId);

    return next();
  });

  const implementer = base.use(entitlementGate).use(sessionCheck);

  const recordingRouter = (
    router: Router<Record<never, never>, ModuleRPCContext>
  ) => {
    const built = implementer.router(router);

    routerOwners.set(built, {
      id: moduleId,
      contract,
      gates: [entitlementGate, sessionCheck],
    });

    return built;
  };

  const replaced = {
    router: recordingRouter,
    ...refusedRootMethods(moduleId),
  };

  // oRPC's implementer is itself a Proxy over the contract, so it cannot be spread or wrapped key
  // by key. This one forwards every read and replaces only `router`, `use` and `lazy`.
  const recording = new Proxy(implementer, {
    get: (target, key, receiver) =>
      key === "router" || key === "use" || key === "lazy"
        ? replaced[key]
        : // oxlint-disable-next-line anti-slop/no-reflect-get -- forwarding a Proxy read to oRPC's implementer; there is no typed key to read.
          Reflect.get(target, key, receiver),
  });

  // SAFETY: `recording` is oRPC's implementer of `contract` with two context-preserving
  // middlewares attached, which is exactly `ModuleImplementer<TContract>`; only the type was
  // narrowed to an empty contract above so the middlewares could be attached.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the empty-contract type above and the caller's contract type do not overlap, by construction.
  return recording as unknown as ModuleImplementer<TContract>;
}

/**
 * A root `.use()` and `.lazy()`, refused when called: the gates are core's to attach, and a lazy
 * router would hide its procedures from the conformance check.
 */
function refusedRootMethods(moduleId: string) {
  const refuse = (message: string) => () => {
    throw new Error(`implementModule("${moduleId}"): ${message}`);
  };

  return {
    use: refuse(
      ".use() on the module root is not supported; core attaches the gates. Add middleware to one procedure with os.<procedure>.use()."
    ),
    lazy: refuse(
      "lazy routers are not supported. Build the router with os.router({...})."
    ),
  };
}
