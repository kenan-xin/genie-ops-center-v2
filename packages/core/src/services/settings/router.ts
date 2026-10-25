import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import {
  type Module,
  SETTINGS_BASE_PERMISSION,
} from "../../lib/module-contract/module.ts";
import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import { settingsContract } from "./contract.ts";
import {
  readSettings,
  saveModuleSettings,
  saveSessionSettings,
  saveSignInSettings,
} from "./index.ts";

// The session check, then the permission gate, both before input is parsed, as in the Modules
// router: a module admin key alone answers `forbidden` at 403 however malformed the input is.
const os = implementCoreArea(settingsContract);

const managed = os.use(async ({ context, next }) => {
  if (!(await can(context.caller, SETTINGS_BASE_PERMISSION))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return next();
});

/**
 * The Tenant Settings router, behind `core:settings:manage` through the one `can()` seam (R-95).
 * A section's own permission is checked by the service, and refusals propagate untranslated.
 */
export function createSettingsRouter(modules: readonly Module[]) {
  return os.router({
    read: managed.read.handler(({ context }) =>
      readSettings(context.tenant, modules, context.caller)
    ),

    saveSignIn: managed.saveSignIn.handler(({ context, input }) =>
      saveSignInSettings(context.tenant, {
        ...input,
        actorUserId: context.caller.userId,
      })
    ),

    saveSessions: managed.saveSessions.handler(({ context, input }) =>
      saveSessionSettings(context.tenant, {
        actorUserId: context.caller.userId,
        sessionIdleMinutes: input.sessionIdleMinutes,
      })
    ),

    saveModule: managed.saveModule.handler(({ context, input }) =>
      saveModuleSettings(context.tenant, modules, context.caller, {
        actorUserId: context.caller.userId,
        moduleId: input.moduleId,
        values: input.values,
      })
    ),
  });
}

export type SettingsRouter = ReturnType<typeof createSettingsRouter>;
