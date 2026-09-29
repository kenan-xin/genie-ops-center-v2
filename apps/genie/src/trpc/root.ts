import {
  createAuditRouter,
  createGroupsRouter,
  createRolesRouter,
} from "@genie/core";

import { modules } from "../registry.ts";
import { t } from "./init.ts";

/**
 * The composed router. Each module contributes exactly one entry, keyed by the
 * id its declaration carries, so the client path is `<moduleId>.<procedure>`.
 * Core's own administration capabilities join them: `audit` behind
 * `core:audit:read` (R-67), `groups` behind `core:groups:manage` and `roles`
 * behind `core:roles:manage` (R-37).
 */
export const appRouter = t.router({
  ...Object.fromEntries(
    modules.map((module) => [module.identity.id, module.router])
  ),
  audit: createAuditRouter(modules),
  groups: createGroupsRouter(),
  roles: createRolesRouter(modules),
});

export type AppRouter = typeof appRouter;
