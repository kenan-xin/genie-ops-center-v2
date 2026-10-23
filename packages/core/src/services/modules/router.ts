import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import { modulesContract } from "./contract.ts";
import { listModules, setModuleCategory, switchModule } from "./index.ts";

const MANAGE_PERMISSION = "core:settings:manage";

// The session check, then the permission gate, both before input is parsed, as in the Roles
// router: a caller without the key answers `forbidden` at 403 however malformed the input is.
const os = implementCoreArea(modulesContract);

const managed = os.use(async ({ context, next }) => {
  if (!(await can(context.caller, MANAGE_PERMISSION))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return next();
});

/**
 * The Modules page router, behind `core:settings:manage` through the one `can()` seam (R-81).
 * Refusals of the enable procedure propagate untranslated to the transport's one mapping (`4xz`).
 */
export function createModulesRouter(modules: readonly Module[]) {
  return os.router({
    list: managed.list.handler(({ context }) =>
      listModules(context.tenant, modules)
    ),

    setEnabled: managed.setEnabled.handler(({ context, input }) =>
      switchModule(context.tenant, modules, {
        actorUserId: context.caller.userId,
        moduleId: input.moduleId,
        enabled: input.enabled,
      })
    ),

    setCategory: managed.setCategory.handler(({ context, input }) =>
      setModuleCategory(context.tenant, modules, {
        actorUserId: context.caller.userId,
        moduleId: input.moduleId,
        categoryId: input.categoryId,
      })
    ),
  });
}

export type ModulesRouter = ReturnType<typeof createModulesRouter>;
