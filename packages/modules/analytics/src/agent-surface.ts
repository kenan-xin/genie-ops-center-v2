import type { AgentInstructions, AgentSurface } from "@genie/core/contracts";

import { ANALYTICS_WRITE_TOOLS } from "./agent-tools.ts";
import { assertCanWrite } from "./services/dashboards/access.ts";
import { insertOwnDashboard } from "./services/dashboards/store.ts";

/**
 * The Dashboards surface's rules, for a holder of `analytics:write` (R-46, P11-48). The fixtures and
 * the recorded requests hold these lines verbatim, so a change here re-keys them.
 */
export const ANALYTICS_SURFACE_INSTRUCTIONS: AgentInstructions = {
  permission: "analytics:write",
  lines: [
    "The record of this chat is a dashboard. Give its id as dashboardId to the dashboard tools.",
    "Change the dashboard only when the person's own message asks for that change. A brief from Ask is such a request. Each analytics-change-dashboard call saves one change, and the person can undo it with Undo on the dashboard.",
    "Build a dashboard panel by panel: call analytics-change-dashboard once for each panel, with one add-panel step.",
    "The dashboard of this chat exists already. Create another dashboard with analytics-create-dashboard only when the person asks for a second dashboard. The person can remove a new dashboard with Delete in the Dashboards list.",
    "When the person asks you to try again, read the dashboard first and add only the panels that it still lacks.",
    "When the person asks for a chart or a table and does not say where, first ask in one short sentence whether to add it as a panel to the dashboard, named by its name, or to just show it here. Then stop and wait for the answer. If the person answers add, add the panel with analytics-change-dashboard. Just show it here means in this chat: make it with make-artifact.",
    "A dashboard panel takes the same config as a Chart in an answer: a chart type, a title and series of dataset queries. Every added or changed panel passes the chart check before it is saved, and a refused panel saves nothing.",
    "The dashboard filters apply to every panel: the date range filters each dataset by its time field, and the field filter, such as Customer, filters each dataset that has that field. Do not repeat them in a panel query.",
  ],
};

/** The Dashboards agent of the dashboard page (DEC-29, amended 2026-11-07; S7-42). */
export const ANALYTICS_SURFACE: AgentSurface = {
  name: "Dashboards agent",
  recordPage: "/m/analytics/dashboards/:id",
  tools: ANALYTICS_WRITE_TOOLS,
  instructions: ANALYTICS_SURFACE_INSTRUCTIONS,
  acceptsHandoff: true,
  // An empty dashboard named by the brief's title. No Undo entry: Delete is its inverse. Through
  // `tx`, so a refused handoff or a taken name leaves no dashboard (P11-50).
  createRecord: async (ctx, tx, { title }) => {
    await assertCanWrite(ctx.caller);

    const record = await insertOwnDashboard(ctx, tx, { name: title });

    return record.id;
  },
};
