import type { PanelConfig } from "@genie/core";

import type { DashboardFilters, PanelLayout } from "../contract.ts";

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
