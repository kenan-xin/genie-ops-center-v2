import { modules } from "../registry.ts";
import { t } from "./init.ts";

/**
 * The composed router. Each module contributes exactly one entry, keyed by the
 * id its declaration carries, so the client path is `<moduleId>.<procedure>`.
 */
export const appRouter = t.router(
  Object.fromEntries(
    modules.map((module) => [module.identity.id, module.router])
  )
);

export type AppRouter = typeof appRouter;
