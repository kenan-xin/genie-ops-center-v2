import type { ChartData } from "@genie/ui/chart-data";
import { describe, expect, it } from "vitest";

import { pptxChartOf } from "./pptx-chart.ts";

const MONTHS = [
  "2026-05-01",
  "2026-06-01",
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
];

/** Two money series by month, as the gate answers them, with one missing value. */
const BAR: ChartData = {
  kind: "bar",
  title: "Billed and paid",
  x: { key: "x", label: "Month", type: "date", bucket: "month" },
  columns: [
    { key: "billed", label: "Billed", type: "money", currency: "SGD" },
    { key: "paid", label: "Paid", type: "money", currency: "SGD" },
  ],
  rows: MONTHS.map((x, i) => ({
    x,
    billed: 3490000 + i * 100,
    paid: i === 2 ? null : 1000000,
  })),
  datasets: ["invoices.invoices"],
  readAt: "2026-10-27T02:00:00.000Z",
  truncated: false,
};

const DONUT: ChartData = {
  ...BAR,
  kind: "donut",
  x: { key: "x", label: "Status", type: "text" },
  columns: [{ key: "n", label: "Invoices", type: "number" }],
  rows: [
    { x: "Paid", n: 7 },
    { x: "Open", n: 3 },
  ],
};

describe("pptxChartOf", () => {
  // C14-3: the export wrote "May 2026" and "2,500.00" where the screen writes "May 26" and "2.6k".
  it("answers the screen's compact month labels and dollars for a two-series money bar", () => {
    expect(pptxChartOf(BAR)).toMatchObject({
      type: "bar",
      formatCode: '[<1000]#,##0;#,##0,"k"',
      series: [
        {
          name: "Billed",
          labels: ["May 26", "Jun 26", "Jul 26", "Aug 26", "Sept 26", "Oct 26"],
          values: [34900, 34901, 34902, 34903, 34904, 34905],
        },
        { name: "Paid" },
      ],
    });
  });

  // C14-3: a code from the currency digits, or "k" on a 250 step, would write "0k, 0k, 1k"; round 1:
  // the tick text equals the screen's (`axisTickFormat`), "1k" and "1m" by size.
  it.each([
    [2600, '[<1000]#,##0;#,##0,"k"'],
    [1000, '[<1000]#,##0;#,##0,"k"'],
    [10000, '[<1000]#,##0;#,##0.0,"k"'],
    [1_000_000, '[<1000]#,##0;[<1000000]#,##0,"k";#,##0,,"m"'],
    [4_000_000, '[<1000000]#,##0;#,##0,,"m"'],
    [0.6, "#,##0.0"],
  ])("writes a top of %s with %s", (top, formatCode) => {
    const counts: ChartData = {
      ...BAR,
      columns: [{ key: "n", label: "Count", type: "number" }],
      rows: [{ x: "2026-05-01", n: top }],
    };

    expect(pptxChartOf(counts).formatCode).toBe(formatCode);
  });

  it("keeps a missing value null, never 0 (R-7)", () => {
    expect(pptxChartOf(BAR).series[1]?.values).toEqual([
      10000,
      10000,
      null,
      10000,
      10000,
      10000,
    ]);
  });

  // Review Focus 1: comparisonMax is in minor units; PowerPoint plots SGD. C14-1: the screen's rounded axis.
  it("scales the screen's value axis to the currency unit", () => {
    expect(pptxChartOf(BAR).axis).toEqual({ min: 0, max: 40000, step: 10000 });
    expect(pptxChartOf(BAR, 7_000_000).axis).toEqual({
      min: 0,
      max: 80000,
      step: 20000,
    });
    expect(pptxChartOf(DONUT, 7).axis).toBeUndefined();
  });

  it("answers a doughnut with its category labels", () => {
    expect(pptxChartOf(DONUT)).toEqual({
      type: "doughnut",
      formatCode: "#,##0",
      series: [{ name: "Invoices", labels: ["Paid", "Open"], values: [7, 3] }],
      axis: undefined,
    });
  });

  it.each(["line", "area"] as const)("keeps the %s type", (kind) => {
    expect(pptxChartOf({ ...BAR, kind }).type).toBe(kind);
  });

  it.each(["kpi", "table"] as const)("throws for a %s", (kind) => {
    expect(() => pptxChartOf({ ...BAR, kind })).toThrow();
  });
});
