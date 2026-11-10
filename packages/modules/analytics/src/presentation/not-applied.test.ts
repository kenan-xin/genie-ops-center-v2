import type { PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";

import type { DashboardFilters, FilterField } from "../contract.ts";
import { notApplied } from "./not-applied.ts";
import type { PanelView } from "./views.ts";

const CONFIG = (datasets: readonly string[]): PanelConfig => ({
  type: "bar",
  title: "Sales",
  series: datasets.map((dataset, index) => ({
    name: `Series ${index + 1}`,
    dataset,
    query: { aggregates: [{ fn: "sum", field: "totalCents", as: "total" }] },
    x: "invoiceDate",
    y: "total",
  })),
});

const PANEL: PanelView = {
  id: "p1",
  layout: { columns: 1, rows: 1 },
  config: CONFIG(["invoices.invoices"]),
};

const FIELDS: readonly FilterField[] = [
  {
    field: "region",
    label: "Region",
    kind: "select",
    datasets: ["invoices.invoices"],
  },
  {
    field: "status",
    label: "Status",
    kind: "multi-select",
    datasets: ["invoices.invoices"],
  },
  {
    field: "overdue",
    label: "Overdue",
    kind: "toggle",
    datasets: ["payments.payments"],
  },
];

const FILTERS = (fields: DashboardFilters["fields"]): DashboardFilters => ({
  dateRange: { preset: "all" },
  fields,
});

describe("notApplied", () => {
  it("names a set filter that reaches none of the panel's datasets", () => {
    expect(
      notApplied(
        PANEL,
        FILTERS([
          { kind: "select", field: "region", label: "Region", value: "North" },
        ]),
        FIELDS
      )
    ).toEqual([]);
    expect(
      notApplied(
        PANEL,
        FILTERS([
          { kind: "toggle", field: "overdue", label: "Overdue", value: true },
        ]),
        FIELDS
      )
    ).toEqual([{ field: "overdue", label: "Overdue" }]);
  });

  it("excuses nothing for a filter that applies nothing", () => {
    expect(
      notApplied(
        PANEL,
        FILTERS([
          { kind: "select", field: "region", label: "Region", value: null },
          {
            kind: "multi-select",
            field: "status",
            label: "Status",
            values: [],
          },
          { kind: "toggle", field: "overdue", label: "Overdue", value: false },
        ]),
        FIELDS
      )
    ).toEqual([]);
  });

  it("counts a multi-select's values and a set toggle as applying", () => {
    expect(
      notApplied(
        PANEL,
        FILTERS([
          {
            kind: "multi-select",
            field: "status",
            label: "Status",
            values: ["Open"],
          },
        ]),
        FIELDS
      )
    ).toEqual([]);
    expect(
      notApplied(
        { ...PANEL, config: CONFIG(["payments.payments"]) },
        FILTERS([
          {
            kind: "multi-select",
            field: "status",
            label: "Status",
            values: ["Open"],
          },
        ]),
        FIELDS
      )
    ).toEqual([{ field: "status", label: "Status" }]);
  });

  it("names the filter that matches one of the panel's series datasets", () => {
    expect(
      notApplied(
        {
          ...PANEL,
          config: CONFIG(["invoices.invoices", "payments.payments"]),
        },
        FILTERS([
          { kind: "toggle", field: "overdue", label: "Overdue", value: true },
        ]),
        FIELDS
      )
    ).toEqual([]);
  });

  it("keeps two filters apart whose fields share a label", () => {
    expect(
      notApplied(
        PANEL,
        FILTERS([
          { kind: "toggle", field: "overdue", label: "Status", value: true },
          {
            kind: "multi-select",
            field: "paymentStatus",
            label: "Status",
            values: ["Late"],
          },
        ]),
        [
          ...FIELDS,
          {
            field: "paymentStatus",
            label: "Status",
            kind: "multi-select",
            datasets: ["payments.payments"],
          },
        ]
      ).map(({ field }) => field)
    ).toEqual(["overdue", "paymentStatus"]);
  });

  it("says nothing for a filter the dashboard no longer offers", () => {
    expect(
      notApplied(
        PANEL,
        FILTERS([{ kind: "select", field: "gone", label: "Gone", value: "x" }]),
        FIELDS
      )
    ).toEqual([]);
  });
});
