import { type AgentInstructions, defineAgentTool } from "@genie/core/contracts";
import { z } from "zod";

import type { StoredPanel } from "./config.ts";
import { dashboardChanges, dashboardId, dashboardName } from "./contract.ts";
import { assertCanRead, assertCanWrite } from "./services/dashboards/access.ts";
import {
  changeDashboard,
  createDashboard,
  listOwnRecords,
  readOwnDashboard,
} from "./services/dashboards/store.ts";

const summaryOf = (panels: readonly StoredPanel[]) =>
  panels.map(({ id, config }) => ({
    id,
    type: config.type,
    title: config.title,
  }));

/*
 * Every output holds no clock value and no data rows: a recorded follow-up request holds the
 * output, so it must be the same on every run (D9, Review Focus 4).
 */

const listDashboardsTool = defineAgentTool({
  name: "analytics-list-dashboards",
  description:
    "Lists this person's own dashboards: each one's id, name, version and panels, with each panel's id, chart type and title.",
  input: z.strictObject({}),
  permission: "analytics:read",
  run: async (ctx) => {
    await assertCanRead(ctx.caller);

    const dashboards = (await listOwnRecords(ctx)).map((record) => ({
      id: record.id,
      name: record.name,
      version: record.version,
      panels: summaryOf(record.config.panels),
    }));

    return { output: { dashboards }, rowCount: dashboards.length };
  },
});

const readDashboardTool = defineAgentTool({
  name: "analytics-read-dashboard",
  description:
    "Reads one of this person's own dashboards by id: its name, version, filters and panels, with each panel's id, layout and chart config.",
  input: z.strictObject({ dashboardId }),
  permission: "analytics:read",
  run: async (ctx, input) => {
    await assertCanRead(ctx.caller);

    const record = await readOwnDashboard(ctx, input.dashboardId);
    const { filters, panels } = record.config;

    return {
      output: {
        id: record.id,
        name: record.name,
        version: record.version,
        filters: filters,
        panels: panels.map(({ id, layout, config }) => ({
          id,
          layout: layout,
          config: config,
        })),
      },
      rowCount: panels.length,
    };
  },
});

const createDashboardTool = defineAgentTool({
  name: "analytics-create-dashboard",
  description:
    "Creates an empty dashboard with the given name for this person and answers its id. The name is unique among this person's dashboards.",
  input: z.strictObject({ name: dashboardName }),
  permission: "analytics:write",
  writes: true,
  run: async (ctx, input) => {
    await assertCanWrite(ctx.caller);

    const record = await createDashboard(ctx, input);

    return {
      output: {
        dashboardId: record.id,
        name: record.name,
        version: record.version,
      },
      rowCount: 1,
    };
  },
});

/** Goes through the store, so the gate, owner-only access, Undo and the audit run as for a hand save. */
const changeDashboardTool = defineAgentTool({
  name: "analytics-change-dashboard",
  description:
    "Saves one change to one of this person's own dashboards: a list of steps, each add-panel, change-panel, remove-panel, move-panel, rename or set-filters. Every added or changed panel passes the chart check first, and a refused step saves nothing. The person can undo the change with Undo on the dashboard.",
  input: z.strictObject({ dashboardId, changes: dashboardChanges }),
  permission: "analytics:write",
  writes: true,
  run: async (ctx, input) => {
    await assertCanWrite(ctx.caller);

    const record = await changeDashboard(ctx, {
      id: input.dashboardId,
      changes: input.changes,
    });

    const panels = summaryOf(record.config.panels);

    return {
      output: { dashboardId: record.id, version: record.version, panels },
      rowCount: panels.length,
    };
  },
});

export const ANALYTICS_AGENT_TOOLS = [
  listDashboardsTool,
  readDashboardTool,
  createDashboardTool,
  changeDashboardTool,
];

/**
 * The module's rules for the agent, for a holder of `analytics:write` only (R-46, R-49). The
 * recorded requests hold these lines verbatim, so a change here re-records them.
 */
export const ANALYTICS_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "analytics:write",
  lines: [
    "Dashboards: the analytics tools read and change only this person's own dashboards. Each dashboard has an id, a name, filters and panels.",
    "Change a dashboard only when the person's own message asks for that change. Each call of analytics-change-dashboard saves one change, and the person can undo it with Undo on the dashboard.",
    "A dashboard panel takes the same config as a Chart in an answer: a chart type, a title and series of dataset queries. Every added or changed panel passes the chart check before it is saved, and a refused panel saves nothing.",
    "The dashboard filters apply to every panel: the date range filters each dataset by its time field, and the field filter, such as Customer, filters each dataset that has that field. Do not repeat them in a panel query.",
  ],
};
