import { describe, expect, it } from "vitest";

import {
  chartCaption,
  formatChartValue,
  isChartEmpty,
  type ChartColumn,
  type ChartData,
} from "./chart-data.ts";

function money(currency?: string): ChartColumn {
  return currency === undefined
    ? { key: "amount", label: "Amount", type: "money" }
    : { key: "amount", label: "Amount", type: "money", currency };
}

const number: ChartColumn = { key: "n", label: "Count", type: "number" };

const date: ChartColumn = { key: "x", label: "Day", type: "date" };

const month: ChartColumn = { ...date, bucket: "month" };

const week: ChartColumn = { ...date, bucket: "week" };

const boolean: ChartColumn = { key: "paid", label: "Paid", type: "boolean" };

describe("formatChartValue", () => {
  it.each([
    ["money in its currency's digits", money("EUR"), 150_000, {}, "€1,500.00"],
    ["yen, which has no minor unit", money("JPY"), 1500, {}, "JP¥1,500"],
    [
      "a table amount in its row currency",
      { ...money(), currencyKey: "currency" },
      700,
      { row: { currency: "USD" } },
      "US$7.00",
    ],
    ["compact money", money("EUR"), 150_000, { compact: true }, "€1.5k"],
    ["a malformed currency", money("EURO"), 150_000, {}, "1,500.00 EURO"],
    ["a number", number, 1234.5678, {}, "1,234.57"],
    ["a compact number", number, 1500, { compact: true }, "1.5k"],
    ["a date", date, "2026-01-05", {}, "5 Jan 2026"],
    ["a week bucket", week, "2026-01-05", {}, "Week of 5 Jan 2026"],
    ["a boolean", boolean, true, {}, "Yes"],
    ["a missing value, never 0", money("EUR"), null, {}, ""],
  ] as const)("formats %s", (_, column, value, options, expected) =>
    expect(formatChartValue(column, value, options)).toBe(expected)
  );

  it("keeps a month bucket in its month west of UTC", () => {
    const zone = process.env.TZ;

    process.env.TZ = "America/New_York";

    try {
      expect(formatChartValue(month, "2026-01-01")).toBe("Jan 2026");
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
  });
});

describe("chartCaption", () => {
  const read = {
    datasets: ["placeholder.records", "invoices.payments"],
    readAt: "2026-10-30T06:05:00Z",
    truncated: false,
    rows: [],
  } satisfies Parameters<typeof chartCaption>[0];

  it("names every dataset and the read time in the tenant zone", () =>
    expect(chartCaption(read, "Asia/Singapore")).toBe(
      "Source: placeholder.records, invoices.payments · Read 30 Oct 2026, 14:05"
    ));

  it("says when the rows were cut at the cap", () =>
    expect(
      chartCaption(
        {
          ...read,
          truncated: true,
          rows: Array.from({ length: 1000 }, () => ({})),
        },
        "Asia/Singapore"
      )
    ).toMatch(/ · First 1,000 rows$/));
});

describe("isChartEmpty", () => {
  const value: ChartColumn = { key: "v", label: "Value", type: "number" };

  function chart(
    kind: ChartData["kind"],
    rows: ChartData["rows"]
  ): Pick<ChartData, "kind" | "columns" | "rows"> {
    return { kind, columns: [value], rows };
  }

  it.each([
    ["a bar with no rows", chart("bar", []), true],
    ["a KPI of null", chart("kpi", [{ v: null }]), true],
    ["a KPI of 0", chart("kpi", [{ v: 0 }]), false],
    [
      "a donut of zero parts",
      chart("donut", [
        { x: "A", v: 0 },
        { x: "B", v: 0 },
      ]),
      true,
    ],
    [
      "a donut with one part",
      chart("donut", [
        { x: "A", v: 0 },
        { x: "B", v: 3 },
      ]),
      false,
    ],
    [
      "a bar of only missing values",
      chart("bar", [{ x: "2026-01-01", v: null }]),
      true,
    ],
    ["a table with no rows", chart("table", []), true],
    ["a table of one row with no values", chart("table", [{ v: null }]), false],
  ] as const)("%s is empty: %s", (_, data, expected) =>
    expect(isChartEmpty(data)).toBe(expected)
  );
});
