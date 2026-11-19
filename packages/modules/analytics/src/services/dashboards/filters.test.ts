import type { DatasetField, DatasetSummary, PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";

import type { DashboardFilters, DateRangeFilter } from "../../contract.ts";
import {
  type DatasetFacts,
  dateBounds,
  effectivePanel,
  filterFieldsFrom,
  filterKindsOf,
  priorBounds,
} from "./filters.ts";

describe("filterKindsOf", () => {
  it.each([
    ["text", ["multi-select", "select"]],
    ["boolean", ["toggle"]],
    ["money", []],
    ["number", []],
    ["date", []],
    ["instant", []],
  ] as const)("offers a %s field the kinds %o", (type, kinds) => {
    expect(filterKindsOf(type)).toEqual(kinds);
  });
});

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
const facts = (
  timeField: string,
  fields: Readonly<Record<string, "text" | "boolean" | "money">>
): DatasetFacts => ({
  timeField,
  fields: new Map(
    Object.entries(fields).map(([name, type]) => [name, { type, label: name }])
  ),
});

const DATASETS: ReadonlyMap<string, DatasetFacts> = new Map([
  [
    "sales.orders",
    facts("orderedOn", {
      customerName: "text",
      paid: "boolean",
      totalCents: "money",
    }),
  ],
  [
    "sales.refunds",
    // `paid` is text here, so a toggle on it fits only the orders.
    facts("refundedOn", { reason: "text", paid: "text" }),
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
      fields: [
        {
          kind: "select",
          field: "customerName",
          label: "Customer",
          value: "Acme",
        },
      ],
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
      fields: [
        {
          kind: "select",
          field: "customerName",
          label: "Customer",
          value: null,
        },
      ],
    };

    expect(effectivePanel(panel, filters, DATASETS, "2026-10-27")).toEqual(
      panel
    );
  });

  const ALL = { preset: "all" } as const;
  const label = "Filter";

  it.each([
    [
      "a multi-select as in with every value",
      {
        kind: "multi-select",
        field: "customerName",
        label,
        values: ["A, B Ltd", "C"],
      },
      [{ field: "customerName", op: "in", values: ["A, B Ltd", "C"] }],
    ],
    [
      "a multi-select with no value as nothing",
      { kind: "multi-select", field: "customerName", label, values: [] },
      [],
    ],
    [
      "a toggle on as eq true",
      { kind: "toggle", field: "paid", label, value: true },
      [{ field: "paid", op: "eq", value: true }],
    ],
    [
      "a toggle off as nothing",
      { kind: "toggle", field: "paid", label, value: false },
      [],
    ],
    [
      "a select on a money field as nothing",
      { kind: "select", field: "totalCents", label, value: "5" },
      [],
    ],
  ] as const satisfies readonly (readonly [
    string,
    DashboardFilters["fields"][number],
    unknown,
  ])[])("adds %s to the orders series only", (_, field, added) => {
    const effective = effectivePanel(
      panel,
      { dateRange: ALL, fields: [field] },
      DATASETS,
      "2026-10-27"
    );

    expect(filtersOf(effective)).toEqual([
      [{ field: "region", op: "neq", value: "North" }, ...added],
      undefined,
    ]);
  });

  it("uses the panel's own range in place of the dashboard range", () => {
    const effective = effectivePanel(
      panel,
      { dateRange: { preset: "this-month" }, fields: [] },
      DATASETS,
      "2026-10-27",
      { from: "2026-01-01", to: "2026-01-31" }
    );

    expect(filtersOf(effective)[1]).toEqual([
      {
        field: "refundedOn",
        op: "between",
        from: "2026-01-01",
        to: "2026-01-31",
      },
    ]);
  });
});

const text = (label: string): DatasetField => ({
  kind: "dimension",
  type: "text",
  label,
  description: "d",
});

const flag = (label: string): DatasetField => ({
  kind: "dimension",
  type: "boolean",
  label,
  description: "d",
});

const money = (label: string): DatasetField => ({
  kind: "measure",
  type: "money",
  label,
  description: "d",
});

const dataset = (
  name: string,
  fields: Record<string, DatasetField>,
  recordKey: string,
  rowKey: Pick<DatasetSummary, "rowKeyField"> = {}
): DatasetSummary => ({
  name,
  description: "d",
  permission: "invoices:read",
  fields,
  timeField: "date",
  recordKey: { type: "record", field: recordKey },
  ...rowKey,
});

const INVOICES = dataset(
  "invoices.invoices",
  {
    id: text("Invoice id"),
    invoiceNumber: text("Invoice"),
    customerId: text("Customer id"),
    customerName: text("Customer"),
    dueDateSource: text("Due date from"),
    hasDueDate: { ...flag("Has a due date"), hiddenFromAgent: true },
    totalCents: money("Total"),
    overdue: flag("Overdue"),
    status: text("Status"),
  },
  "id"
);

const PAYMENTS = dataset(
  "invoices.payments",
  {
    id: text("Payment id"),
    customerId: text("Customer id"),
    customerName: text("Customer"),
    status: text("Status"),
  },
  "id"
);

const CUSTOMERS = dataset(
  "invoices.customers",
  { id: text("Customer id"), name: text("Customer"), email: text("Email") },
  "id"
);

const ORDERS = dataset(
  "other.orders",
  { number: text("Number"), line: text("Line"), region: text("Region") },
  "number",
  { rowKeyField: "line" }
);

describe("filterFieldsFrom", () => {
  it("offers the fields a person filters by and keeps the id fields a filter may name", () => {
    expect(
      filterFieldsFrom([INVOICES], ["invoices.invoices"]).map(
        ({ field, offered }) => [field, offered]
      )
    ).toEqual([
      ["customerName", true],
      ["customerId", false],
      ["dueDateSource", true],
      ["hasDueDate", true],
      ["invoiceNumber", true],
      ["id", false],
      ["overdue", true],
      ["status", true],
    ]);
  });

  it("offers one field per label, the first that the panels name, and merges a field that two datasets share", () => {
    const fields = filterFieldsFrom(
      [CUSTOMERS, PAYMENTS, INVOICES],
      ["invoices.invoices", "invoices.payments", "invoices.customers"]
    );

    const byField = (name: string) =>
      fields.find(({ field }) => field === name);

    expect(byField("customerName")).toEqual({
      field: "customerName",
      label: "Customer",
      kind: "multi-select",
      datasets: ["invoices.invoices", "invoices.payments"],
      offered: true,
    });
    expect(byField("name")).toEqual({
      field: "name",
      label: "Customer",
      kind: "multi-select",
      datasets: ["invoices.customers"],
      offered: false,
    });
    expect(byField("status")?.datasets).toEqual([
      "invoices.invoices",
      "invoices.payments",
    ]);

    expect(
      filterFieldsFrom(
        [CUSTOMERS, PAYMENTS, INVOICES],
        ["invoices.customers", "invoices.invoices"]
      )
        .filter(({ label, offered }) => offered && label === "Customer")
        .map(({ field }) => field)
    ).toEqual(["name"]);
  });

  it("leaves out a record key and a row key that are not named as ids", () => {
    expect(
      filterFieldsFrom([ORDERS], ["other.orders"]).map(({ field, offered }) => [
        field,
        offered,
      ])
    ).toEqual([
      ["line", false],
      ["number", false],
      ["region", true],
    ]);
  });
});
