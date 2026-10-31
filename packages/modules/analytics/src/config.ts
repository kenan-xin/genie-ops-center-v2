import { type PanelConfig, panelConfigSchema } from "@genie/core";
import { z } from "zod";

import {
  DASHBOARD_PANEL_LIMIT,
  type DashboardFilters,
  dashboardFilters,
  type PanelLayout,
  panelId,
  panelLayout,
} from "./contract.ts";

export type StoredPanel = {
  readonly id: string;
  readonly layout: PanelLayout;
  readonly config: PanelConfig;
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
});

/** The server's parse of a stored or changed config. */
export const dashboardConfigSchema: z.ZodType<DashboardConfig> = z.strictObject(
  {
    filters: dashboardFilters,
    panels: z
      .array(storedPanel)
      .max(DASHBOARD_PANEL_LIMIT)
      .superRefine((panels, ctx) => {
        const seen = new Set<string>();

        for (const [index, { id }] of panels.entries()) {
          if (seen.has(id)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "id"],
              message: `Two panels share the id ${id}.`,
            });
          }

          seen.add(id);
        }
      }),
  }
);

export const EMPTY_DASHBOARD_CONFIG: DashboardConfig = {
  filters: { dateRange: { preset: "all" }, field: null },
  panels: [],
};
