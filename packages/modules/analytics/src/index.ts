/**
 * The module-facing declaration. The application imports this and nothing else: the registry
 * mounts the router, the navigation and the pages from the one object below.
 *
 * A client or a story imports `@genie/module-analytics/presentation` instead, which carries the
 * components without the router, the schema or their server dependencies.
 */

export { analyticsModule } from "./module.ts";

export { analyticsContract, type AnalyticsContract } from "./contract.ts";

export { ANALYTICS_PERMISSIONS } from "./permissions.ts";

export { analyticsRouter, type AnalyticsRouter } from "./router.ts";

export { dashboard, MIGRATIONS, MIGRATIONS_TABLE } from "./schema.ts";
