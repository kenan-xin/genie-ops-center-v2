import type { ChatAvailability, PanelConfig } from "@genie/core";

import type {
  DashboardFilters,
  DashboardSummary,
  DateRangeFilter,
  FilterField,
  PanelLayout,
  SavedView,
} from "../contract.ts";

/** One panel as the dashboard page reads it. */
export type PanelView = {
  id: string;
  layout: PanelLayout;
  config: PanelConfig;
  /** A panel's own date range, in place of the dashboard's (R-49, P15-10). */
  ownRange?: DateRangeFilter | undefined;
};

/** One dashboard as its owner reads it (R-48). */
export type DashboardView = {
  id: string;
  name: string;
  version: number;
  canUndo: boolean;
  filters: DashboardFilters;
  /** The fields Add filter offers, sorted by label. */
  filterFields: readonly FilterField[];
  panels: readonly PanelView[];
  views: readonly SavedView[];
  /** The view the dashboard opens with, else its stored filters. */
  defaultViewId: string | null;
};

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
