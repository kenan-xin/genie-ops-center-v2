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
  step: {
    active: "Looking up the dashboards",
    done: "Looked up the dashboards",
    failed: "Could not look up the dashboards",
  },
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
  step: {
    active: "Reading the dashboard",
    done: "Read the dashboard",
    failed: "Could not read the dashboard",
  },
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
  step: {
    active: "Making a dashboard",
    done: "Made a dashboard",
    failed: "Could not make a dashboard",
  },
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
  step: {
    active: "Changing the dashboard",
    done: "Changed the dashboard",
    failed: "Could not change the dashboard",
  },
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

/** The write tools, which only the Dashboards surface offers (P11-46). */
export const ANALYTICS_WRITE_TOOLS = [createDashboardTool, changeDashboardTool];

/** The read tools, which Ask and the Dashboards surface session both get. */
export const ANALYTICS_AGENT_TOOLS = [listDashboardsTool, readDashboardTool];

/**
 * The module's read rule for the agent, for a holder of `analytics:read` (R-49, P11-48). The
 * recorded requests hold this line verbatim, so a change here re-records them.
 */
export const ANALYTICS_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "analytics:read",
  lines: [
    "Dashboards: the analytics tools read only this person's own dashboards. Each dashboard has an id, a name, filters and panels.",
  ],
};
