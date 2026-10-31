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
  it("answers month labels and dollars for a two-series money bar", () => {
    expect(pptxChartOf(BAR)).toMatchObject({
      type: "bar",
      formatCode: "#,##0.00",
      series: [
        {
          name: "Billed",
          labels: [
            "May 2026",
            "Jun 2026",
            "Jul 2026",
            "Aug 2026",
            "Sept 2026",
            "Oct 2026",
          ],
          values: [34900, 34901, 34902, 34903, 34904, 34905],
        },
        { name: "Paid" },
      ],
    });
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

  it("answers a doughnut with its category labels", () => {
    expect(pptxChartOf(DONUT)).toEqual({
      type: "doughnut",
      formatCode: "#,##0",
      series: [{ name: "Invoices", labels: ["Paid", "Open"], values: [7, 3] }],
    });
  });

  it.each(["line", "area"] as const)("keeps the %s type", (kind) => {
    expect(pptxChartOf({ ...BAR, kind }).type).toBe(kind);
  });

  it.each(["kpi", "table"] as const)("throws for a %s", (kind) => {
    expect(() => pptxChartOf({ ...BAR, kind })).toThrow();
  });
});
