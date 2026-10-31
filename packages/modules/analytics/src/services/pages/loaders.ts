import {
  agentAccess,
  can,
  type ModuleRequestContext,
  reportingDate,
} from "@genie/core";

import type {
  ChatAvailability,
  DashboardListView,
  DashboardPageView,
} from "../../presentation/views.ts";
import { assertCanRead } from "../dashboards/access.ts";
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

/** The chat beside a dashboard: only for a person who may ask, and off while models are off. */
async function chatOf(ctx: ModuleRequestContext): Promise<ChatAvailability> {
  const access = await agentAccess(ctx);

  if (!access.permitted) return { kind: "none" };

  if (access.ai !== "on") return { kind: "off" };

  return {
    kind: "on",
    models: { allowed: access.allowedModels, chatDefault: access.chatModel },
  };
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

  const [canWrite, date, branding, chat] = await Promise.all([
    can(ctx.caller, "analytics:write"),
    reportingDate(ctx.tenant),
    ctx.tenant.branding.get(),
    chatOf(ctx),
  ]);

  return {
    dashboard: viewOf(record),
    canWrite,
    reportingDate: date,
    timeZone: branding.defaultTimeZone,
    chat,
  };
}
