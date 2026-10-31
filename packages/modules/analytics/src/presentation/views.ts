import type { PanelConfig } from "@genie/core";

import type {
  DashboardFilters,
  DashboardSummary,
  PanelLayout,
} from "../contract.ts";

/** One panel as the dashboard page reads it. */
export type PanelView = {
  id: string;
  layout: PanelLayout;
  config: PanelConfig;
};

/** One dashboard as its owner reads it (R-48). */
export type DashboardView = {
  id: string;
  name: string;
  version: number;
  canUndo: boolean;
  filters: DashboardFilters;
  panels: readonly PanelView[];
};

/** Whether the chat beside a dashboard can run: `none` for a person who cannot ask. */
export type ChatAvailability =
  | {
      readonly kind: "on";
      readonly models: {
        readonly allowed: readonly string[];
        readonly chatDefault: string | null;
      };
    }
  | { readonly kind: "off" }
  | { readonly kind: "none" };

/** What the Dashboards list page loads. */
export type DashboardListView = {
  readonly dashboards: readonly DashboardSummary[];
  readonly canWrite: boolean;
};

/** What one dashboard page loads. */
export type DashboardPageView = {
  readonly dashboard: DashboardView;
  readonly canWrite: boolean;
  readonly reportingDate: string;
  readonly timeZone: string;
  readonly chat: ChatAvailability;
};
