import { describe, expect, it } from "vitest";

import {
  dashboardConfigSchema,
  EMPTY_DASHBOARD_CONFIG,
  storedDashboardConfig,
} from "./config.ts";

// Only a dataset name: the module imports no other module (Global Constraints).
const kpi = {
  type: "kpi",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: "placeholder.records",
      query: { aggregates: [{ fn: "count", as: "n" }] },
      value: "n",
    },
  ],
};

const panel = (id: string, layout = { columns: 1, rows: 1 }) => ({
  id,
  layout,
  config: kpi,
});

const withPanels = (panels: readonly unknown[]) => ({
  ...EMPTY_DASHBOARD_CONFIG,
  panels,
});

const panels = (count: number) =>
  Array.from({ length: count }, (_, index) => panel(`p${index + 1}`));

const withRange = (dateRange: { from: string; to: string }) => ({
  ...EMPTY_DASHBOARD_CONFIG,
  filters: { dateRange, fields: [] },
});

const noPanels = { ...EMPTY_DASHBOARD_CONFIG, panels: [] };

const fieldFilter = (field: string) => ({
  kind: "select",
  field,
  label: "Customer",
  value: null,
});

/** An empty dashboard with `count` distinct field filters. */
const withFields = (count: number) => ({
  ...noPanels,
  filters: {
    dateRange: { preset: "all" },
    fields: Array.from({ length: count }, (_, index) =>
      fieldFilter(`field${index + 1}`)
    ),
  },
});

describe("the dashboard config", () => {
  it.each([
    ["12 panels", 12, true],
    ["13 panels", 13, false],
  ])("with %s parses: %s", (_, count, parses) => {
    expect(
      dashboardConfigSchema.safeParse(withPanels(panels(count))).success
    ).toBe(parses);
  });

  it.each([
    ["4 field filters", 4, true],
    ["5 field filters", 5, false],
  ])("with %s parses: %s", (_, count, parses) => {
    expect(dashboardConfigSchema.safeParse(withFields(count)).success).toBe(
      parses
    );
  });

  it("refuses two filters on one field", () => {
    const result = dashboardConfigSchema.safeParse({
      ...noPanels,
      filters: {
        dateRange: { preset: "all" },
        fields: [fieldFilter("customerName"), fieldFilter("customerName")],
      },
    });

    expect(
      result.error?.issues.map(({ path, message }) => ({ path, message }))
    ).toEqual([
      {
        path: ["filters", "fields", 1, "field"],
        message: "Two filters use the field customerName.",
      },
    ]);
  });

  it("refuses two panels with one id", () => {
    const result = dashboardConfigSchema.safeParse(
      withPanels([panel("p1"), panel("p1")])
    );

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Two panels share the id p1.",
    ]);
  });

  it.each([
    ["4 columns and 2 rows", { columns: 4, rows: 2 }, true],
    ["5 columns", { columns: 5, rows: 1 }, false],
    ["3 rows", { columns: 1, rows: 3 }, false],
  ])("with a panel of %s parses: %s", (_, layout, parses) => {
    expect(
      dashboardConfigSchema.safeParse(withPanels([panel("p1", layout)])).success
    ).toBe(parses);
  });

  it("parses a custom range of one day", () => {
    expect(
      dashboardConfigSchema.safeParse(
        withRange({ from: "2026-10-01", to: "2026-10-01" })
      ).success
    ).toBe(true);
  });

  it("refuses a custom range that ends before it starts, at its end date", () => {
    const result = dashboardConfigSchema.safeParse(
      withRange({ from: "2026-10-02", to: "2026-10-01" })
    );

    expect(
      result.error?.issues.map(({ path, message }) => ({ path, message }))
    ).toEqual([
      {
        path: ["filters", "dateRange", "to"],
        message: "The end date is on or after the start date.",
      },
    ]);
  });
});

/** A row written before the field filters were a list: one `field`, or none. */
const storedWith = (
  field: { field: string; label: string; value: string | null } | null
) => ({
  filters: { dateRange: { preset: "all" }, field },
  panels: [],
});

describe("storedDashboardConfig", () => {
  it("reads a stored single field as a list of one", () => {
    const stored = storedDashboardConfig.parse(
      storedWith({
        field: "customerName",
        label: "Customer",
        value: "Demo Company",
      })
    );

    expect(stored.filters.fields).toEqual([
      {
        kind: "select",
        field: "customerName",
        label: "Customer",
        value: "Demo Company",
      },
    ]);
  });

  it("reads a stored empty field as no fields", () => {
    expect(
      storedDashboardConfig.parse(storedWith(null)).filters.fields
    ).toEqual([]);
  });
});
