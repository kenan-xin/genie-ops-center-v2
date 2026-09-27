import { createAuditRouter } from "@genie/core";

import { modules } from "../registry.ts";
import { t } from "./init.ts";

/**
 * The composed router. Each module contributes exactly one entry, keyed by the
 * id its declaration carries, so the client path is `<moduleId>.<procedure>`.
 * Core's own audit reader joins them under `audit`, behind `core:audit:read`,
 * because it is core's capability and not a module's (R-67).
 */
export const appRouter = t.router({
  ...Object.fromEntries(
    modules.map((module) => [module.identity.id, module.router])
  ),
  audit: createAuditRouter(modules),
});

export type AppRouter = typeof appRouter;
