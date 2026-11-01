import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ChartRows,
  question,
} from "../../testing/invoice-answer-readers.ts";
import { scoreAnswer, scoreCharts } from "./score-answers.ts";

const rows = z.array(
  z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
);

/** The two charts a perfect answer to `overdue-balances` draws, from the expected answer. */
function overdueBalances(): ChartRows[] {
  const expected = question("overdue-balances");

  return [
    { title: "Overdue balance by customer", rows: rows.parse(expected.rows) },
    {
      title: "Overdue total",
      rows: [{ Overdue: expected.totalCents ?? null }],
    },
  ];
}

describe("the answer scorer", () => {
  it("passes the exact answer", () => {
    expect(scoreAnswer("overdue-balances", overdueBalances())).toEqual({
      pass: true,
    });
  });

  it("fails an answer with one row's cents changed", () => {
    const [balances, total] = overdueBalances();

    const changed = balances?.rows.map((row, index) =>
      index === 0
        ? Object.assign({}, row, {
            overdueCents: Number(row["overdueCents"]) + 1,
          })
        : row
    );

    expect(
      scoreAnswer("overdue-balances", [
        { title: "Overdue balance by customer", rows: changed ?? [] },
        ...(total === undefined ? [] : [total]),
      ]).pass
    ).toBe(false);
  });

  it("fails an answer with a row dropped", () => {
    const [balances, total] = overdueBalances();

    expect(
      scoreAnswer("overdue-balances", [
        {
          title: "Overdue balance by customer",
          rows: balances?.rows.slice(1) ?? [],
        },
        ...(total === undefined ? [] : [total]),
      ]).pass
    ).toBe(false);
  });

  it("fails an answer and its chart case when a chart is missing, and names it", () => {
    const charts = overdueBalances().filter(
      (chart) => chart.title !== "Overdue total"
    );

    expect(scoreAnswer("overdue-balances", charts)).toEqual({
      pass: false,
      reason: "The answer has no chart Overdue total.",
    });
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Overdue total", pass: false, reason: "missing" },
    ]);
  });

  it("fails a chart case whose chart the gate refused", () => {
    const [balances] = overdueBalances();

    expect(
      scoreCharts("overdue-balances", [
        ...(balances === undefined ? [] : [balances]),
        { title: "Overdue total", refused: "chart-invalid" },
      ])
    ).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Overdue total", pass: false, reason: "chart-invalid" },
    ]);
  });
});
