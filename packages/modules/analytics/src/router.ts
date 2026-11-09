import { implementModule, type ModuleRequestContext } from "@genie/core";

import { analyticsContract } from "./contract.ts";
import { assertCanRead, assertCanWrite } from "./services/dashboards/access.ts";
import { filterFieldsOf } from "./services/dashboards/filters.ts";
import { filterValues, panelData } from "./services/dashboards/panel-data.ts";
import {
  changeDashboard,
  createDashboard,
  deleteDashboard,
  listOwnDashboards,
  readOwnDashboard,
  type DashboardRecord,
  undoDashboard,
  viewOf,
} from "./services/dashboards/store.ts";

const os = implementModule("analytics", analyticsContract);

const view = async (ctx: ModuleRequestContext, record: DashboardRecord) =>
  viewOf(record, await filterFieldsOf(ctx, record.config.panels));

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

  readDashboard: os.readDashboard.handler(async ({ context, input }) => {
    await assertCanRead(context.caller);

    return view(context, await readOwnDashboard(context, input.id));
  }),

  createDashboard: os.createDashboard.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return view(context, await createDashboard(context, input));
  }),

  changeDashboard: os.changeDashboard.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return view(context, await changeDashboard(context, input));
  }),

  undoDashboard: os.undoDashboard.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return view(context, await undoDashboard(context, input));
  }),

  deleteDashboard: os.deleteDashboard.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);
    await deleteDashboard(context, input.id);

    return { id: input.id };
  }),

  panelData: os.panelData.handler(async ({ context, input }) => {
    await assertCanRead(context.caller);

    return panelData(context, input);
  }),

  filterValues: os.filterValues.handler(async ({ context, input }) => {
    await assertCanRead(context.caller);

    return [...(await filterValues(context, input))];
  }),
});

export type AnalyticsRouter = typeof analyticsRouter;
