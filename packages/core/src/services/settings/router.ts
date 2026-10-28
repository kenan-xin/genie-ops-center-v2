import {
  type Module,
  SETTINGS_BASE_PERMISSION,
} from "../../lib/module-contract/module.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { settingsContract } from "./contract.ts";
import {
  readSettings,
  saveModuleSettings,
  saveReportingSettings,
  saveSessionSettings,
  saveSignInSettings,
} from "./index.ts";

// The session check, then the permission gate, both before input is parsed, as in the Modules
// router: a module admin key alone answers `forbidden` at 403 however malformed the input is.
const managed = gatedArea(settingsContract, SETTINGS_BASE_PERMISSION);

/**
 * The Tenant Settings router, behind `core:settings:manage` through the one `can()` seam (R-95).
 * A section's own permission is checked by the service, and refusals propagate untranslated.
 */
export function createSettingsRouter(modules: readonly Module[]) {
  return managed.router({
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

    saveReporting: managed.saveReporting.handler(({ context, input }) =>
      saveReportingSettings(context.tenant, {
        actorUserId: context.caller.userId,
        reportingDate: input.reportingDate,
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
