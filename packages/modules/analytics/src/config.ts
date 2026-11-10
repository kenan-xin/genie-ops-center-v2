import { type PanelConfig, panelConfigSchema } from "@genie/core";
import { z } from "zod";

import {
  DASHBOARD_PANEL_LIMIT,
  DASHBOARD_VIEW_LIMIT,
  type DashboardFilters,
  dashboardFilters,
  type DateRangeFilter,
  dateRangeFilter,
  dashboardSavedView,
  type PanelLayout,
  panelId,
  panelLayout,
  type SavedView,
  viewId,
} from "./contract.ts";

export type StoredPanel = {
  readonly id: string;
  readonly layout: PanelLayout;
  readonly config: PanelConfig;
  /** A panel's own date range, in place of the dashboard's (R-49, P15-10). */
  readonly ownRange?: DateRangeFilter | undefined;
};

/** The stored config of one dashboard: its filters and its panels in display order (R-48). */
export type DashboardConfig = {
  readonly filters: DashboardFilters;
  readonly panels: readonly StoredPanel[];
  /** Named filter values, never panels (R-49a). */
  readonly views: readonly SavedView[];
  /** The view the dashboard opens with; `null` opens the stored filters. */
  readonly defaultViewId: string | null;
};

/** One save that Undo can restore (D1). */
export type UndoEntry = {
  readonly name: string;
  readonly config: DashboardConfig;
};

const storedPanel = z.strictObject({
  id: panelId,
  layout: panelLayout,
  // Core's chart schema, so a stored panel has the shape the chart gate checks (R-14, R-15).
  config: panelConfigSchema,
  ownRange: dateRangeFilter.optional(),
});

const panels = z
  .array(storedPanel)
  .max(DASHBOARD_PANEL_LIMIT)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();

    for (const [index, { id }] of list.entries()) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Two panels share the id ${id}.`,
        });
      }

      seen.add(id);
    }
  });

const views = z
  .array(dashboardSavedView)
  .max(DASHBOARD_VIEW_LIMIT)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();

    for (const [index, { name }] of list.entries()) {
      // A name is unique ignoring case and outer spaces (P15-17).
      const key = name.trim().toLowerCase();

      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: `Two views share the name ${key}.`,
        });
      }

      seen.add(key);
    }
  });

const defaultNamesView = (
  config: Pick<DashboardConfig, "views" | "defaultViewId">,
  ctx: z.RefinementCtx
) => {
  const { views: list, defaultViewId } = config;

  if (defaultViewId !== null && !list.some(({ id }) => id === defaultViewId)) {
    ctx.addIssue({
      code: "custom",
      path: ["defaultViewId"],
      message: `No view ${defaultViewId} on this dashboard.`,
    });
  }
};

/** The strict new shape a save writes. */
export const dashboardConfigSchema: z.ZodType<DashboardConfig> = z
  .strictObject({
    filters: dashboardFilters,
    panels,
    views,
    defaultViewId: viewId.nullable(),
  })
  .superRefine(defaultNamesView);

/** A row's single field filter, written before the field filters became a list (P15-2). */
const legacyField = z
  .strictObject({
    field: z.string(),
    label: z.string(),
    value: z.string().nullable(),
  })
  .nullable()
  .optional();

/**
 * A row's config as the server reads it. The old single `field` reads as a list of one, or as no
 * fields when null, so no migration is needed; a save still writes the strict new shape (P15-2).
 * A row written before saved views reads no views and no default (S7-47).
 */
export const storedDashboardConfig: z.ZodType<DashboardConfig> = z
  .strictObject({
    filters: z
      .strictObject({
        dateRange: dateRangeFilter,
        fields: dashboardFilters.shape.fields.optional(),
        field: legacyField,
      })
      .transform(({ dateRange, fields, field }) => ({
        dateRange,
        fields:
          fields ??
          (field === null || field === undefined
            ? []
            : [{ kind: "select" as const, ...field }]),
      }))
      .pipe(dashboardFilters),
    panels,
    views: views.default([]),
    defaultViewId: viewId.nullable().default(null),
  })
  .superRefine(defaultNamesView);

export const EMPTY_DASHBOARD_CONFIG: DashboardConfig = {
  filters: { dateRange: { preset: "all" }, fields: [] },
  panels: [],
  views: [],
  defaultViewId: null,
};
