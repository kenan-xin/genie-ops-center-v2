import { describe, expect, it } from "vitest";

import {
  chartCaption,
  chartRows,
  formatChartValue,
  isChartEmpty,
  axisTickFormat,
  kpiChange,
  niceAxis,
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

describe("niceAxis", () => {
  // C14-1: 2,600 split in four gave "650, 1.3k, 2k, 2.6k", where "2k" stood for 1,950.
  it.each([
    ["a top of 2,600", [1200, 2600], 0, 3000, [0, 1000, 2000, 3000]],
    ["the prototype's days", [38, 53], 0, 60, [0, 20, 40, 60]],
    ["a fraction", [0.6], 0, 0.6, [0, 0.2, 0.4, 0.6]],
    ["a loss", [-300, 600], -500, 750, [-500, -250, 0, 250, 500, 750]],
    ["only zeros", [0, 0], 0, 1, [0, 1]],
  ] as const)("steps %s evenly", (_, values, min, max, ticks) => {
    expect(niceAxis(values)).toEqual({
      min,
      max,
      step: ticks[1]! - ticks[0]!,
      ticks,
    });
  });
});

describe("axisTickFormat", () => {
  // C14-3 fix round 1: one rule writes a tick on screen and in PowerPoint, "1k" and "1m" by size,
  // and per unit the decimals its ticks need, so one axis reads alike.
  it.each([
    [
      "0 to 10k by 2.5k",
      [0, 2500, 5000, 7500, 10000],
      ["0", "2.5k", "5.0k", "7.5k", "10.0k"],
      '[<1000]#,##0;#,##0.0,"k"',
    ],
    [
      "0 to 1k by 250",
      [0, 250, 500, 750, 1000],
      ["0", "250", "500", "750", "1k"],
      '[<1000]#,##0;#,##0,"k"',
    ],
    [
      "0 to 1m by 250k",
      [0, 250_000, 500_000, 750_000, 1_000_000],
      ["0", "250k", "500k", "750k", "1m"],
      '[<1000]#,##0;[<1000000]#,##0,"k";#,##0,,"m"',
    ],
    [
      "0 to 0.6 by 0.2",
      [0, 0.2, 0.4, 0.6],
      ["0.0", "0.2", "0.4", "0.6"],
      "#,##0.0",
    ],
  ] as const)("writes %s", (_, ticks, texts, code) => {
    const format = axisTickFormat(ticks);

    expect(ticks.map(format.text)).toEqual(texts);
    expect(format.code).toBe(code);
  });
});

describe("chartRows", () => {
  it("turns a chart's data into labelled rows as the chart shows them", () => {
    expect(
      chartRows({
        x: month,
        columns: [
          money("EUR"),
          number,
          { key: "due", label: "Due", type: "money", currencyKey: "cur" },
        ],
        rows: [
          { x: "2026-09-01", amount: 650_000, n: 1200, due: 100, cur: "USD" },
          { x: "2026-10-01", amount: null, n: 3, due: 250, cur: "EUR" },
        ],
      })
    ).toEqual({
      // The bare amounts keep their currency in the header; a currency per row stays in each cell.
      header: ["Day", "Amount (EUR)", "Count", "Due"],
      rows: [
        ["Sept 2026", "6,500.00", "1,200", "US$1.00"],
        ["Oct 2026", "", "3", "€2.50"],
      ],
    });
  });
});

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
    [
      "a compact month, the axis label",
      month,
      "2026-09-01",
      { compact: true },
      "Sept 26",
    ],
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
      "Source: placeholder.records, invoices.payments · as of 30 Oct 2026, 14:05"
    ));

  it("names the sources by title when the chart has them, so a stored chart without keeps its names", () =>
    expect(
      chartCaption({ ...read, sources: ["Records", "Payments"] }, "UTC")
    ).toBe("Source: Records, Payments · as of 30 Oct 2026, 06:05"));

  it("drops the read time for a source-only caption", () =>
    expect(
      chartCaption({ ...read, sources: ["Records"] }, "UTC", "source")
    ).toBe("Source: Records"));

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

describe("kpiChange", () => {
  it.each([
    ["a rise", 10_430, 10_000, { direction: "up", text: "+4.3% on September" }],
    [
      "a fall",
      5910,
      10_000,
      { direction: "down", text: "−40.9% on September" },
    ],
    [
      "no change",
      500,
      500,
      { direction: "flat", text: "No change on September" },
    ],
    [
      "a rise from 0, with no percentage",
      500,
      0,
      { direction: "up", text: "Up from 0 on September" },
    ],
    ["no current figure", null, 500, null],
  ] as const)("answers %s", (_, current, previous, expected) =>
    expect(kpiChange(current, { previous, label: "September" })).toEqual(
      expected
    )
  );
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
