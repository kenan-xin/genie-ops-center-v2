import type { ChartColumn, ChartData } from "@genie/ui";
import { describe, expect, it } from "vitest";

import { priorKpiValue } from "./panel-data.ts";

const kpi = (column: ChartColumn, value: number | null): ChartData => ({
  kind: "kpi",
  title: "Collected",
  columns: [column],
  rows: [{ [column.key]: value }],
  datasets: ["sales.payments"],
  readAt: "2026-10-27T01:00:00Z",
  truncated: false,
});

const money = (currency: string): ChartColumn => ({
  key: "Collected",
  label: "Collected",
  type: "money",
  currency,
});

const count: ChartColumn = {
  key: "Collected",
  label: "Collected",
  type: "number",
};

describe("priorKpiValue", () => {
  it.each([
    ["the same currency", money("SGD"), money("SGD"), 90_000, 90_000],
    // SGD 1,000 against USD 900 is no change a person can read.
    ["another currency", money("SGD"), money("USD"), 90_000, null],
    ["a count", count, count, 12, 12],
    ["an empty prior period", money("SGD"), money("SGD"), null, null],
  ] as const)("answers %s", (_, now, before, value, expected) =>
    expect(priorKpiValue(kpi(now, 100_000), kpi(before, value))).toBe(expected)
  );
});
