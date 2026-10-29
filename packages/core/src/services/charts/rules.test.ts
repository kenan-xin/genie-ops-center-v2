import type { ChartColumn, ChartData, ChartRow } from "@genie/ui";
import { describe, expect, it } from "vitest";

import type { DatasetQuery } from "../datasets/query.ts";
import {
  type CartesianSeries,
  CHART_TYPES,
  type ChartType,
  type DonutSeries,
  type KpiSeries,
  type PanelConfig,
  type TableSeries,
} from "./panel-config.ts";
import { dataIssues, queryRuleIssues } from "./rules.ts";

const count = [{ fn: "count", as: "n" }] as const;

const sumQuantity = [{ fn: "sum", field: "quantity", as: "n" }] as const;

const month = { field: "recordedOn", bucket: "month" } as const;

const monthly: DatasetQuery = { groupBy: [month], aggregates: count };

const base = { name: "Records", dataset: "placeholder.records" };

const cartesian = (over: Partial<CartesianSeries>): CartesianSeries => ({
  ...base,
  query: monthly,
  x: "recordedOn",
  y: "n",
  ...over,
});

const bar = (over: Partial<CartesianSeries> = {}): PanelConfig => ({
  type: "bar",
  title: "Records",
  series: [cartesian(over)],
});

const line = (over: Partial<CartesianSeries> = {}): PanelConfig => ({
  type: "line",
  title: "Records",
  series: [cartesian(over)],
});

const bar2 = (): PanelConfig => ({
  type: "bar",
  title: "Records",
  series: [cartesian({ name: "Invoiced" }), cartesian({ name: "Collected" })],
});

const donut = (over: Partial<DonutSeries> = {}): PanelConfig => ({
  type: "donut",
  title: "Records",
  series: [
    {
      ...base,
      query: { groupBy: [{ field: "label" }], aggregates: count },
      category: "label",
      value: "n",
      ...over,
    },
  ],
});

const kpi = (over: Partial<KpiSeries> = {}): PanelConfig => ({
  type: "kpi",
  title: "Records",
  series: [{ ...base, query: { aggregates: count }, value: "n", ...over }],
});

const table = (over: Partial<TableSeries> = {}): PanelConfig => ({
  type: "table",
  title: "Records",
  series: [{ ...base, query: { select: ["label", "amountCents"] }, ...over }],
});

const minimal = (type: ChartType): PanelConfig =>
  type === "kpi"
    ? kpi()
    : type === "donut"
      ? donut()
      : type === "table"
        ? table()
        : { type, title: "Records", series: [cartesian({})] };

const text: ChartColumn = { key: "x", label: "Label", type: "text" };

const monthColumn: ChartColumn = {
  key: "x",
  label: "Recorded on",
  type: "date",
  bucket: "month",
};

const number: ChartColumn = {
  key: "Records",
  label: "Records",
  type: "number",
};

const moneyNone: ChartColumn = {
  key: "Records",
  label: "Records",
  type: "money",
};

const money = (currency: string): ChartColumn => ({ ...moneyNone, currency });

/** The columns of `bar2()`, keyed by its series names. */
const named = (columns: readonly ChartColumn[]) =>
  columns.map((column, index) => ({
    ...column,
    key: index === 0 ? "Invoiced" : "Collected",
    label: index === 0 ? "Invoiced" : "Collected",
  }));

const data = (over: Partial<ChartData> = {}): ChartData => ({
  kind: "bar",
  title: "Records",
  x: monthColumn,
  columns: [number],
  rows: [],
  datasets: ["placeholder.records"],
  readAt: "2026-10-30T06:05:00Z",
  truncated: false,
  ...over,
});

const parts = (values: readonly number[]): ChartData =>
  data({
    kind: "donut",
    x: text,
    rows: values.map((value, index): ChartRow => ({
      x: `Part ${index + 1}`,
      Records: value,
    })),
  });

describe("queryRuleIssues", () => {
  it.each<readonly [string, PanelConfig, readonly string[]]>([
    ["y names no aggregate", bar({ y: "sum" }), ["series.0.y"]],
    ["x is not the group", bar({ x: "label" }), ["series.0.x"]],
    [
      "a second group",
      bar({
        query: { groupBy: [month, { field: "currency" }], aggregates: count },
      }),
      ["series.0.query.groupBy"],
    ],
    [
      "a select chart",
      bar({ query: { select: ["label"] } }),
      ["series.0.query"],
    ],
    ["a bar of one group", bar(), []],
    [
      "a line ordered by value",
      line({
        query: { ...monthly, orderBy: [{ column: "n", direction: "desc" }] },
      }),
      ["series.0.query.orderBy"],
    ],
    [
      "a line ordered by x",
      line({
        query: {
          ...monthly,
          orderBy: [{ column: "recordedOn", direction: "asc" }],
        },
      }),
      [],
    ],
    [
      "a donut grouped off its category",
      donut({ category: "currency" }),
      ["series.0.category"],
    ],
    [
      "a donut of averages",
      donut({
        query: {
          groupBy: [{ field: "label" }],
          aggregates: [{ fn: "avg", field: "quantity", as: "n" }],
        },
      }),
      ["series.0.value"],
    ],
    [
      "a donut of sums",
      donut({
        query: { groupBy: [{ field: "label" }], aggregates: sumQuantity },
      }),
      [],
    ],
    [
      "a donut in value order",
      donut({
        query: {
          groupBy: [{ field: "label" }],
          aggregates: count,
          orderBy: [{ column: "n", direction: "desc" }],
        },
      }),
      ["series.0.query.orderBy"],
    ],
    [
      "a donut cut by limit",
      donut({
        query: { groupBy: [{ field: "label" }], aggregates: count, limit: 5 },
      }),
      ["series.0.query.limit"],
    ],
    [
      "a KPI with a group",
      kpi({ query: { groupBy: [{ field: "label" }], aggregates: count } }),
      ["series.0.query.groupBy"],
    ],
    [
      "a KPI of rows",
      kpi({ query: { select: ["label"] } }),
      ["series.0.query.select", "series.0.value"],
    ],
    ["a KPI of one aggregate", kpi(), []],
  ])("shape: %s", (_, config, paths) =>
    expect(queryRuleIssues(config).map((issue) => issue.path)).toEqual(paths)
  );

  it("lists the answered columns when a field is not one of them", () =>
    expect(queryRuleIssues(bar({ y: "sum" }))).toEqual([
      {
        path: "series.0.y",
        message:
          'Field "sum" is not a column of this query. It answers: recordedOn, n.',
      },
    ]));
});

describe("dataIssues", () => {
  it.each<readonly [string, PanelConfig, ChartData, readonly string[]]>([
    ["a line over text", line(), data({ x: text }), ["series.0.x"]],
    ["a line over a month", line(), data({ x: monthColumn }), []],
    [
      "a line over ranges",
      line(),
      data({ x: { ...text, bucket: "ranges" } }),
      [],
    ],
    ["a bar over money", bar(), data({ x: money("EUR") }), ["series.0.x"]],
    [
      "a donut over money",
      donut(),
      data({ kind: "donut", x: money("EUR") }),
      ["series.0.category"],
    ],
    ["a text value", bar(), data({ columns: [text] }), ["series.0.y"]],
    [
      "a date KPI",
      kpi(),
      data({ kind: "kpi", columns: [monthColumn] }),
      ["series.0.value"],
    ],
    [
      "money beside a number",
      bar2(),
      data({ columns: named([money("EUR"), number]) }),
      ["series.1.y"],
    ],
    [
      "two currencies",
      bar2(),
      data({ columns: named([money("EUR"), money("USD")]) }),
      ["series.1.y"],
    ],
    [
      "one currency",
      bar2(),
      data({ columns: named([money("EUR"), money("EUR")]) }),
      [],
    ],
    [
      "EUR beside a series with no rows yet",
      bar2(),
      data({
        columns: named([money("EUR"), moneyNone]),
        rows: [{ x: "2026-01-01", Invoiced: 5, Collected: null }],
      }),
      [],
    ],
    [
      "money with no currency",
      bar(),
      data({ columns: [moneyNone], rows: [{ x: "2026-01-01", Records: 5 }] }),
      ["series.0.y"],
    ],
    [
      "empty money with no currency",
      bar(),
      data({
        columns: [moneyNone],
        rows: [{ x: "2026-01-01", Records: null }],
      }),
      [],
    ],
    ["a negative part", donut(), parts([5, -1]), ["series.0.value"]],
    ["a zero part", donut(), parts([5, 0]), []],
    [
      "nine parts",
      donut(),
      parts([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      ["series.0.category"],
    ],
    ["eight parts", donut(), parts([1, 1, 1, 1, 1, 1, 1, 1]), []],
    [
      "a table amount with no currency",
      table(),
      data({ kind: "table", columns: [moneyNone], rows: [{ Records: 1500 }] }),
      ["series.0.query"],
    ],
    [
      "a table amount with its row currency",
      table(),
      data({
        kind: "table",
        columns: [{ ...moneyNone, currencyKey: "currency" }],
        rows: [{ Records: 1500, currency: "EUR" }],
      }),
      [],
    ],
    [
      "an empty table of amounts",
      table(),
      data({ kind: "table", columns: [moneyNone], rows: [] }),
      [],
    ],
    ...CHART_TYPES.map(
      (type) =>
        [
          `an empty ${type}`,
          minimal(type),
          data({ kind: type, rows: [] }),
          [],
        ] as const
    ),
  ])("data: %s", (_, config, chartData, paths) =>
    expect(dataIssues(config, chartData).map((issue) => issue.path)).toEqual(
      paths
    )
  );

  it.each<readonly [string, PanelConfig, ChartData, string]>([
    [
      "an unordered line",
      line(),
      data({ x: text }),
      "A line chart needs an ordered x-axis. Group x by a date, a number or ranges.",
    ],
    [
      "two currencies",
      bar2(),
      data({ columns: named([money("EUR"), money("USD")]) }),
      'Every series shares one y-axis. "Invoiced" is in EUR and "Collected" is in USD. Filter one currency.',
    ],
    [
      "nine parts",
      donut(),
      parts([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      "A donut shows at most 8 parts, and this query answers 9. Filter the query, or group by a field with fewer values.",
    ],
  ])("names the fix for %s", (_, config, chartData, message) =>
    expect(dataIssues(config, chartData).map((issue) => issue.message)).toEqual(
      [message]
    )
  );
});
