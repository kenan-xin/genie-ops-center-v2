import { oc } from "@genie/core/rpc";
import { z } from "zod";

/** At most 12 panels per dashboard, because each panel queries every 10 seconds (D10). */
export const DASHBOARD_PANEL_LIMIT = 12;

/** The saves a dashboard keeps for Undo, newest first (D1). */
export const UNDO_DEPTH = 20;

/** The steps one change may hold. */
export const DASHBOARD_CHANGE_LIMIT = 20;

/** The date range presets, relative to the reporting date (D3). */
export const DATE_RANGE_PRESETS = [
  "all",
  "this-month",
  "last-3-months",
  "last-6-months",
  "this-year",
] as const;

export const dashboardId = z.uuid();

/** `p<n>`: the highest number plus one, never reused (D9). */
export const panelId = z.string().regex(/^p[1-9][0-9]{0,2}$/);

export const dashboardName = z.string().trim().min(1).max(80);

export const panelLayout = z.strictObject({
  columns: z.int().min(1).max(4),
  rows: z.int().min(1).max(2),
});

export const dateRangeFilter = z.union([
  z.strictObject({ preset: z.enum(DATE_RANGE_PRESETS) }),
  z
    .strictObject({ from: z.iso.date(), to: z.iso.date() })
    .refine((range) => range.from <= range.to, {
      path: ["to"],
      message: "The end date is on or after the start date.",
    }),
]);

/** One filter on a text field, applied to every series whose dataset declares it (D3). */
export const fieldFilter = z.strictObject({
  field: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/),
  label: z.string().trim().min(1).max(40),
  value: z.string().min(1).max(200).nullable(),
});

export const dashboardFilters = z.strictObject({
  dateRange: dateRangeFilter,
  field: fieldFilter.nullable(),
});

export const dashboardSummary = z.object({
  id: z.string(),
  name: z.string(),
  panelCount: z.int(),
  updatedAt: z.string(),
});

/** One step of a change. A panel's raw config is checked by the chart gate, not here (D2). */
export const dashboardChange = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add-panel"),
    panel: z.unknown(),
    layout: panelLayout.optional(),
  }),
  z.strictObject({
    op: z.literal("change-panel"),
    panelId,
    panel: z.unknown().optional(),
    layout: panelLayout.optional(),
  }),
  z.strictObject({ op: z.literal("remove-panel"), panelId }),
  z.strictObject({
    op: z.literal("move-panel"),
    panelId,
    toIndex: z
      .int()
      .min(0)
      .max(DASHBOARD_PANEL_LIMIT - 1),
  }),
  z.strictObject({ op: z.literal("rename"), name: dashboardName }),
  z.strictObject({ op: z.literal("set-filters"), filters: dashboardFilters }),
]);

export const dashboardChanges = z
  .array(dashboardChange)
  .min(1)
  .max(DASHBOARD_CHANGE_LIMIT);

/** One dashboard as its owner reads it. The browser narrows each panel `config` (Global Constraints). */
export const dashboardView = z.object({
  id: z.string(),
  name: z.string(),
  version: z.int(),
  canUndo: z.boolean(),
  filters: dashboardFilters,
  // Read-only, so the server's `DashboardView` answers it as is.
  panels: z
    .array(
      z.object({ id: z.string(), layout: panelLayout, config: z.unknown() })
    )
    .readonly(),
});

export type PanelLayout = z.infer<typeof panelLayout>;

export type DashboardChange = z.infer<typeof dashboardChange>;

export type DateRangeFilter = z.infer<typeof dateRangeFilter>;

export type FieldFilter = z.infer<typeof fieldFilter>;

export type DashboardFilters = z.infer<typeof dashboardFilters>;

export type DashboardSummary = z.infer<typeof dashboardSummary>;

/**
 * The module's API, published as `@genie/module-analytics/contract` (ADR 0011). It imports only zod
 * and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this file
 * without pulling any server code. Every path starts with the module id.
 */
export const analyticsContract = {
  listDashboards: oc
    .route({ method: "GET", path: "/analytics/dashboards" })
    .output(z.array(dashboardSummary)),
  readDashboard: oc
    .route({ method: "GET", path: "/analytics/dashboards/{id}" })
    .input(z.object({ id: dashboardId }))
    .output(dashboardView),
  createDashboard: oc
    .route({ method: "POST", path: "/analytics/dashboards" })
    .input(z.object({ name: dashboardName }))
    .output(dashboardView),
  changeDashboard: oc
    .route({ method: "PATCH", path: "/analytics/dashboards/{id}" })
    .input(
      z.object({
        id: dashboardId,
        expectedVersion: z.int().min(1),
        changes: dashboardChanges,
      })
    )
    .output(dashboardView),
  undoDashboard: oc
    .route({ method: "POST", path: "/analytics/dashboards/{id}/undo" })
    .input(z.object({ id: dashboardId, expectedVersion: z.int().min(1) }))
    .output(dashboardView),
  deleteDashboard: oc
    .route({ method: "DELETE", path: "/analytics/dashboards/{id}" })
    .input(z.object({ id: dashboardId }))
    .output(z.object({ id: z.string() })),
  /** One panel's chart data under the dashboard filters, through the chart gate (R-15, R-49). */
  panelData: oc
    .route({
      method: "GET",
      path: "/analytics/dashboards/{id}/panels/{panelId}",
    })
    .input(z.object({ id: dashboardId, panelId }))
    // The gate's ChartData; the browser narrows it once (Global Constraints).
    .output(z.unknown()),
  /** The values the field filter offers, from the panel datasets that declare the field. */
  filterValues: oc
    .route({ method: "GET", path: "/analytics/dashboards/{id}/filter-values" })
    .input(z.object({ id: dashboardId }))
    .output(z.array(z.string())),
};

export type AnalyticsContract = typeof analyticsContract;
