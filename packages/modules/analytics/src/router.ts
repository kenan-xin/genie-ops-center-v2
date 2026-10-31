import { implementModule } from "@genie/core";

import { analyticsContract } from "./contract.ts";
import { assertCanRead } from "./services/dashboards/access.ts";
import { listOwnDashboards } from "./services/dashboards/store.ts";

const os = implementModule("analytics", analyticsContract);

/**
 * The module's router, built by core from the contract and mounted under the module id when the
 * module is enabled. Each procedure asks `can()` first and reads only the caller's own rows
 * through `context.tenant.db` (DEC-34, DEC-39, D8).
 */
export const analyticsRouter = os.router({
  listDashboards: os.listDashboards.handler(async ({ context }) => {
    await assertCanRead(context.caller);

    return listOwnDashboards(context);
  }),
});

export type AnalyticsRouter = typeof analyticsRouter;
