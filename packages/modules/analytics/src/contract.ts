import { oc } from "@genie/core/rpc";
import { z } from "zod";

/** At most 12 panels per dashboard, because each panel queries every 10 seconds (D10). */
export const DASHBOARD_PANEL_LIMIT = 12;

/** The saves a dashboard keeps for Undo, newest first (D1). */
export const UNDO_DEPTH = 20;

/** The steps one change may hold. */
export const DASHBOARD_CHANGE_LIMIT = 20;

/** At most 4 field filters per dashboard; the date range does not count (R-49, D3). */
export const FIELD_FILTER_LIMIT = 4;

/** At most 20 saved views per dashboard, so the config and each Undo entry stay small (P15-17). */
export const DASHBOARD_VIEW_LIMIT = 20;

/** The date range presets, relative to the reporting date (D3). */
export const DATE_RANGE_PRESETS = [
  "all",
  "this-month",
  "last-3-months",
  "last-6-months",
  "this-year",
] as const;

export const dashboardId = z.uuid();

/** `p<n>`: a new panel takes the highest current number plus one, so a removed last id comes back (D9). */
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

/** A dataset field name a filter names. */
export const filterFieldName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/);

/** One filter on a field, applied to every series whose dataset declares it (D3, R-49). */
const fieldFilterFields = {
  field: filterFieldName,
  label: z.string().trim().min(1).max(40),
};

export const fieldFilter = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("select"),
    ...fieldFilterFields,
    value: z.string().min(1).max(200).nullable(),
  }),
  z.strictObject({
    kind: z.literal("multi-select"),
    ...fieldFilterFields,
    values: z.array(z.string().min(1).max(200)).max(50),
  }),
  z.strictObject({
    kind: z.literal("toggle"),
    ...fieldFilterFields,
    value: z.boolean(),
  }),
]);

export const dashboardFilters = z.strictObject({
  dateRange: dateRangeFilter,
  fields: z
    .array(fieldFilter)
    .max(FIELD_FILTER_LIMIT)
    .superRefine((filters, ctx) => {
      const seen = new Set<string>();

      for (const [index, { field }] of filters.entries()) {
        if (seen.has(field)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "field"],
            message: `Two filters use the field ${field}.`,
          });
        }

        seen.add(field);
      }
    }),
});

/** `v<n>`: a new view takes the highest current number plus one, as a panel does (P15-18). */
export const viewId = z.string().regex(/^v[1-9][0-9]{0,2}$/);

/** Unique on the dashboard, ignoring case and outer spaces (P15-17). */
export const viewName = z.string().trim().min(1).max(40);

/** A saved view holds filter values only, never panels (R-49a). */
export const dashboardSavedView = z.strictObject({
  id: viewId,
  name: viewName,
  filters: dashboardFilters,
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
    /** A panel's own date range, which replaces the dashboard range; `null` uses the dashboard's. */
    ownRange: dateRangeFilter.nullable().optional(),
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
  /** Without `id` adds a view; with `id` replaces that view's name and filters (P15-19). */
  z.strictObject({
    op: z.literal("save-view"),
    id: viewId.optional(),
    name: viewName,
    filters: dashboardFilters,
  }),
  z.strictObject({ op: z.literal("remove-view"), id: viewId }),
  /** `null` opens the dashboard with its stored filters. */
  z.strictObject({ op: z.literal("set-default-view"), id: viewId.nullable() }),
]);

export const dashboardChanges = z
  .array(dashboardChange)
  .min(1)
  .max(DASHBOARD_CHANGE_LIMIT);

/** A field the page can filter by: a text or boolean field of a panel dataset the caller reads. */
export const filterField = z.object({
  field: z.string(),
  label: z.string(),
  kind: z.enum(["multi-select", "select", "toggle"]),
  /** The panel datasets that declare the field. */
  datasets: z.array(z.string()),
});

/** One dashboard as its owner reads it. The browser narrows each panel `config` (Global Constraints). */
export const dashboardView = z.object({
  id: z.string(),
  name: z.string(),
  version: z.int(),
  canUndo: z.boolean(),
  filters: dashboardFilters,
  filterFields: z.array(filterField).readonly(),
  views: z.array(dashboardSavedView).readonly(),
  /** The view the dashboard opens with, else its stored filters. */
  defaultViewId: viewId.nullable(),
  // Read-only, so the server's `DashboardView` answers it as is.
  panels: z
    .array(
      z.object({
        id: z.string(),
        layout: panelLayout,
        config: z.unknown(),
        ownRange: dateRangeFilter.optional(),
      })
    )
    .readonly(),
});

export type PanelLayout = z.infer<typeof panelLayout>;

export type DashboardChange = z.infer<typeof dashboardChange>;

export type DateRangeFilter = z.infer<typeof dateRangeFilter>;

export type FieldFilter = z.infer<typeof fieldFilter>;

export type DashboardFilters = z.infer<typeof dashboardFilters>;

export type FilterField = z.infer<typeof filterField>;

export type SavedView = z.infer<typeof dashboardSavedView>;

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
  /**
   * One panel's chart data under the dashboard filters, through the chart gate (R-15, R-49).
   * `filters` replaces the stored ones for this read only and is never saved.
   */
  panelData: oc
    .route({
      method: "GET",
      path: "/analytics/dashboards/{id}/panels/{panelId}",
    })
    .input(
      z.object({
        id: dashboardId,
        panelId,
        filters: dashboardFilters.optional(),
      })
    )
    // The gate's ChartData; the browser narrows it once (Global Constraints).
    .output(z.unknown()),
  /**
   * The values a filter on `field` offers, from the panel datasets that declare it as text, under
   * the date range and every other field filter (P15-6). `filters` is never saved.
   */
  filterValues: oc
    .route({ method: "GET", path: "/analytics/dashboards/{id}/filter-values" })
    .input(
      z.object({
        id: dashboardId,
        field: filterFieldName,
        filters: dashboardFilters.optional(),
      })
    )
    .output(z.array(z.string())),
};

export type AnalyticsContract = typeof analyticsContract;
