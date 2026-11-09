import {
  can,
  chatAvailability,
  type ModuleRequestContext,
  reportingDate,
} from "@genie/core";

import type {
  DashboardListView,
  DashboardPageView,
} from "../../presentation/views.ts";
import { assertCanRead } from "../dashboards/access.ts";
import { filterFieldsOf } from "../dashboards/filters.ts";
import {
  listOwnDashboards,
  readOwnDashboard,
  viewOf,
} from "../dashboards/store.ts";

/** The Dashboards list: the caller's own dashboards, and whether the caller may write (R-48). */
export async function loadDashboardList(
  ctx: ModuleRequestContext
): Promise<DashboardListView> {
  await assertCanRead(ctx.caller);

  const [dashboards, canWrite] = await Promise.all([
    listOwnDashboards(ctx),
    can(ctx.caller, "analytics:write"),
  ]);

  return { dashboards, canWrite };
}

/**
 * One dashboard page. Another person's dashboard id throws `not-found`, which `openModulePage`
 * answers as missing (R-48).
 */
export async function loadDashboardPage(
  ctx: ModuleRequestContext,
  id: string
): Promise<DashboardPageView> {
  await assertCanRead(ctx.caller);

  const record = await readOwnDashboard(ctx, id);

  const [canWrite, date, branding, chat, filterFields] = await Promise.all([
    can(ctx.caller, "analytics:write"),
    reportingDate(ctx.tenant),
    ctx.tenant.branding.get(),
    chatAvailability(ctx),
    filterFieldsOf(ctx, record.config.panels),
  ]);

  return {
    dashboard: viewOf(record, filterFields),
    canWrite,
    reportingDate: date,
    timeZone: branding.defaultTimeZone,
    chat,
  };
}
