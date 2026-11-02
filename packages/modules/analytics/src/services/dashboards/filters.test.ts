import type { PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";

import type { DashboardFilters, DateRangeFilter } from "../../contract.ts";
import {
  type DatasetFacts,
  dateBounds,
  effectivePanel,
  priorBounds,
} from "./filters.ts";

describe("dateBounds", () => {
  it.each([
    [{ preset: "all" }, "2026-10-27", null],
    [
      { preset: "this-month" },
      "2026-10-27",
      { from: "2026-10-01", to: "2026-10-27" },
    ],
    [
      { preset: "last-3-months" },
      "2026-10-27",
      { from: "2026-08-01", to: "2026-10-27" },
    ],
    [
      { preset: "last-6-months" },
      "2026-10-27",
      { from: "2026-05-01", to: "2026-10-27" },
    ],
    [
      { preset: "this-year" },
      "2026-10-27",
      { from: "2026-01-01", to: "2026-10-27" },
    ],
    [
      { preset: "last-3-months" },
      "2026-03-31",
      { from: "2026-01-01", to: "2026-03-31" },
    ],
    [
      { from: "2025-12-01", to: "2026-02-15" },
      "2026-10-27",
      { from: "2025-12-01", to: "2026-02-15" },
    ],
  ] as const satisfies readonly (readonly [
    DateRangeFilter,
    string,
    unknown,
  ])[])("answers %o at %s as %o", (range, date, bounds) => {
    expect(dateBounds(range, date)).toEqual(bounds);
  });
});

describe("priorBounds", () => {
  it.each([
    [
      { preset: "this-month" },
      "2026-10-27",
      { from: "2026-09-01", to: "2026-09-27", label: "September" },
    ],
    [
      { preset: "this-month" },
      "2026-05-31",
      { from: "2026-04-01", to: "2026-04-30", label: "April" },
    ],
    [
      { preset: "last-3-months" },
      "2026-10-27",
      { from: "2026-05-01", to: "2026-07-27", label: "the 3 months before" },
    ],
    [
      { preset: "this-year" },
      "2026-10-27",
      { from: "2025-01-01", to: "2025-10-27", label: "2025" },
    ],
    [
      { from: "2026-10-11", to: "2026-10-20" },
      "2026-10-27",
      { from: "2026-10-01", to: "2026-10-10", label: "the 10 days before" },
    ],
    [{ preset: "all" }, "2026-10-27", null],
  ] as const satisfies readonly (readonly [
    DateRangeFilter,
    string,
    unknown,
  ])[])("compares %o at %s with %o", (range, date, bounds) => {
    expect(priorBounds(range, date)).toEqual(bounds);
  });
});

// Only dataset names: the module imports no other module (Global Constraints).
const DATASETS: ReadonlyMap<string, DatasetFacts> = new Map([
  [
    "sales.orders",
    { timeField: "orderedOn", textFields: new Set(["customerName"]) },
  ],
  [
    "sales.refunds",
    { timeField: "refundedOn", textFields: new Set(["reason"]) },
  ],
]);

const panel: PanelConfig = {
  type: "bar",
  title: "Sales",
  series: [
    {
      name: "Orders",
      dataset: "sales.orders",
      x: "region",
      y: "n",
      query: {
        filters: [{ field: "region", op: "neq", value: "North" }],
        groupBy: [{ field: "region" }],
        aggregates: [{ fn: "count", as: "n" }],
      },
    },
    {
      name: "Refunds",
      dataset: "sales.refunds",
      x: "region",
      y: "n",
      query: {
        groupBy: [{ field: "region" }],
        aggregates: [{ fn: "count", as: "n" }],
      },
    },
  ],
};

const filtersOf = (config: PanelConfig) =>
  config.series.map((series) => series.query.filters);

describe("effectivePanel", () => {
  it("adds the date filter on each series' own time field and the field filter only where the dataset declares it", () => {
    const filters: DashboardFilters = {
      dateRange: { preset: "this-month" },
      field: { field: "customerName", label: "Customer", value: "Acme" },
    };

    const effective = effectivePanel(panel, filters, DATASETS, "2026-10-27");

    expect(filtersOf(effective)).toEqual([
      [
        { field: "region", op: "neq", value: "North" },
        {
          field: "orderedOn",
          op: "between",
          from: "2026-10-01",
          to: "2026-10-27",
        },
        { field: "customerName", op: "eq", value: "Acme" },
      ],
      [
        {
          field: "refundedOn",
          op: "between",
          from: "2026-10-01",
          to: "2026-10-27",
        },
      ],
    ]);
    expect({ ...effective, series: [] }).toEqual({ ...panel, series: [] });
  });

  it("leaves the panel the same for the range all and a field filter with no value", () => {
    const filters: DashboardFilters = {
      dateRange: { preset: "all" },
      field: { field: "customerName", label: "Customer", value: null },
    };

    expect(effectivePanel(panel, filters, DATASETS, "2026-10-27")).toEqual(
      panel
    );
  });
});
