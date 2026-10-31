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

export type PanelLayout = z.infer<typeof panelLayout>;

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
};

export type AnalyticsContract = typeof analyticsContract;
