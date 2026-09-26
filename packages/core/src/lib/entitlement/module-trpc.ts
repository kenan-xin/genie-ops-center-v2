import { initTRPC } from "@trpc/server";

import { AppError, CORE_ERRORS } from "../errors/index.ts";
import type { ModuleRequestContext } from "../module-contract/module.ts";

/**
 * What a module procedure reads: the module contract's request context plus the request id the
 * application attaches for R-46 correlation. The id is optional because a module may be exercised
 * outside the application, where no request id exists; the application always supplies one.
 */
export type ModuleTRPCContext = ModuleRequestContext & {
  readonly requestId?: string;
};

/**
 * R-8, the per-procedure half (d1y): one `initTRPC` root built against the module request
 * context, whose `procedure` carries the entitlement gate as middleware. A module builds its
 * router from the returned `{ router, procedure }` and never imports `initTRPC` itself, so the
 * gate that refuses a disabled module runs per procedure rather than refusing a whole mixed
 * batch. The gate reads only the entitlement reader and the request id: switching a module off
 * is a deployment decision, not a permission (DEC-39).
 *
 * The thrown error is the catalogue `AppError` `module-disabled`, carrying the request id the
 * same way the batch gate did, so a formatter that runs with a context still correlates the body
 * with the log line (R-46, AC-15).
 */
export function createModuleTRPC(moduleId: string) {
  const t = initTRPC.context<ModuleTRPCContext>().create();

  const gate = t.middleware(async ({ ctx, next }) => {
    if (!(await ctx.tenant.entitlements.isEnabled(moduleId))) {
      const { requestId } = ctx;

      throw new AppError(
        CORE_ERRORS["module-disabled"],
        requestId === undefined ? {} : { requestId }
      );
    }

    return next();
  });

  return {
    router: t.router,
    procedure: t.procedure.use(gate),
  };
}
