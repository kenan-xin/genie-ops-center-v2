import { type PanelConfig, panelConfigSchema } from "@genie/core";
import { z } from "zod";

import {
  DASHBOARD_PANEL_LIMIT,
  type DashboardFilters,
  dashboardFilters,
  type DateRangeFilter,
  dateRangeFilter,
  type PanelLayout,
  panelId,
  panelLayout,
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

/** The strict new shape a save writes. */
export const dashboardConfigSchema: z.ZodType<DashboardConfig> = z.strictObject(
  {
    filters: dashboardFilters,
    panels,
  }
);

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
 */
export const storedDashboardConfig: z.ZodType<DashboardConfig> = z.strictObject(
  {
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
  }
);

export const EMPTY_DASHBOARD_CONFIG: DashboardConfig = {
  filters: { dateRange: { preset: "all" }, fields: [] },
  panels: [],
};
