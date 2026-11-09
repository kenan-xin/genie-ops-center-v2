import type { PanelConfig } from "@genie/core";
import type { ChartData } from "@genie/ui";

import type { DashboardFilters } from "../../contract.ts";
import type {
  DashboardListView,
  DashboardPageView,
  PanelView,
} from "../views.ts";

/** The field filter the starter dashboard labels Customer (D3). */
export const CUSTOMER_FIELD = {
  kind: "select",
  field: "label",
  label: "Customer",
  value: null,
} as const;

export const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: { preset: "all" },
  fields: [CUSTOMER_FIELD],
};

const KPI: PanelConfig = {
  type: "kpi",
  title: "Invoiced sales",
  series: [
    {
      name: "Invoiced",
      dataset: "invoices.invoices",
      query: { aggregates: [{ fn: "sum", field: "totalCents", as: "total" }] },
      value: "total",
    },
  ],
};

const BAR: PanelConfig = {
  type: "bar",
  title: "Monthly invoiced sales",
  series: [
    {
      name: "Invoiced",
      dataset: "invoices.invoices",
      query: {
        groupBy: [{ field: "invoiceDate", bucket: "month" }],
        aggregates: [{ fn: "sum", field: "totalCents", as: "total" }],
      },
      x: "invoiceDate",
      y: "total",
    },
  ],
};

const TABLE: PanelConfig = {
  type: "table",
  title: "Top customers",
  series: [
    {
      name: "Customers",
      dataset: "invoices.invoices",
      query: { select: ["customerName"] },
    },
  ],
};

const KPI_PANEL: PanelView = {
  id: "p1",
  layout: { columns: 1, rows: 1 },
  config: KPI,
};

const BAR_PANEL: PanelView = {
  id: "p2",
  layout: { columns: 2, rows: 2 },
  config: BAR,
};

const TABLE_PANEL: PanelView = {
  id: "p3",
  layout: { columns: 2, rows: 2 },
  config: TABLE,
};

const CHAT_ON = {
  kind: "on",
  models: { allowed: [], chatDefault: null },
  labels: {
    steps: {
      "analytics-change-dashboard": {
        active: "Changing the dashboard",
        done: "Changed the dashboard",
        failed: "Could not change the dashboard",
      },
    },
    datasets: { "invoices.invoices": "Invoices" },
    fields: {},
  },
  suggestions: [],
} as const;

export const defaultDashboardList: DashboardListView = {
  canWrite: true,
  dashboards: [
    {
      id: "dashboard-1",
      name: "Receivables overview",
      panelCount: 3,
      updatedAt: "2026-10-27T09:00:00.000Z",
    },
    {
      id: "dashboard-2",
      name: "Cash in",
      panelCount: 1,
      updatedAt: "2026-10-26T09:00:00.000Z",
    },
  ],
};

export const readOnlyDashboardList: DashboardListView = {
  ...defaultDashboardList,
  canWrite: false,
};

export const emptyDashboardList: DashboardListView = {
  canWrite: true,
  dashboards: [],
};

export const defaultDashboardPage: DashboardPageView = {
  dashboard: {
    id: "dashboard-1",
    name: "Receivables overview",
    version: 1,
    canUndo: false,
    filters: DEFAULT_FILTERS,
    panels: [KPI_PANEL, BAR_PANEL, TABLE_PANEL],
  },
  canWrite: true,
  reportingDate: "2026-10-27",
  timeZone: "Asia/Singapore",
  chat: CHAT_ON,
};

export const emptyDashboardPage: DashboardPageView = {
  ...defaultDashboardPage,
  dashboard: { ...defaultDashboardPage.dashboard, panels: [] },
};

export const noChatDashboardPage: DashboardPageView = {
  ...emptyDashboardPage,
  chat: { kind: "none" },
};

export const chatOnDashboardPage: DashboardPageView = {
  ...defaultDashboardPage,
  chat: {
    ...CHAT_ON,
    models: {
      allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
      chatDefault: "openai/gpt-6.1-terra",
    },
  },
};

export const chatOffDashboardPage: DashboardPageView = {
  ...defaultDashboardPage,
  chat: { kind: "off" },
};

export const chatNoneDashboardPage: DashboardPageView = {
  ...defaultDashboardPage,
  chat: { kind: "none" },
};

export const readOnlyDashboardPage: DashboardPageView = {
  ...defaultDashboardPage,
  canWrite: false,
};

export const kpiChart: ChartData = {
  kind: "kpi",
  title: "Invoiced sales",
  columns: [
    { key: "total", label: "Invoiced sales", type: "money", currency: "SGD" },
  ],
  rows: [{ total: 23640000 }],
  datasets: ["invoices.invoices"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

export const barChart: ChartData = {
  kind: "bar",
  title: "Monthly invoiced sales",
  x: { key: "month", label: "Month", type: "date", bucket: "month" },
  columns: [
    { key: "total", label: "Invoiced", type: "money", currency: "SGD" },
  ],
  rows: [
    { month: "2026-08-01", total: 15000000 },
    { month: "2026-09-01", total: 8640000 },
  ],
  datasets: ["invoices.invoices"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

export const tableChart: ChartData = {
  kind: "table",
  title: "Top customers",
  columns: [
    { key: "customerName", label: "Customer", type: "text" },
    { key: "total", label: "Invoiced", type: "money", currency: "SGD" },
  ],
  rows: [{ customerName: "ABC Trading", total: 650000 }],
  datasets: ["invoices.invoices"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
};

export const chartOf = (panelId: string): ChartData => {
  switch (panelId) {
    case "p1":
      return kpiChart;
    case "p2":
      return barChart;
    default:
      return tableChart;
  }
};

export const FILTER_VALUES = ["Alpha", "Bravo", "Charlie"] as const;
