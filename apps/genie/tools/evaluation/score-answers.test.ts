import type { DatasetQuery, PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AnswerChart,
  question,
} from "../../testing/invoice-answer-readers.ts";
import { scoreAnswer, scoreCharts } from "./score-answers.ts";

type Row = Record<string, string | number | null>;

const rows = z.array(
  z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
);

/** A chart the gate accepted: the config as the model wrote it and the rows the gate answered. */
function drawn(config: PanelConfig, answered: readonly Row[]): AnswerChart {
  return { config, data: { rows: answered } };
}

const overdueQuery = (as: string): DatasetQuery => ({
  filters: [{ field: "overdue", op: "eq", value: true }],
  groupBy: [{ field: "customerName" }],
  aggregates: [{ fn: "sum", field: "outstandingCents", as }],
});

/** The table of `overdue-balances`, titled and aliased as given, with the expected rows. */
function balances(title: string, dataset: string, as: string): AnswerChart {
  return drawn(
    {
      type: "table",
      title,
      series: [{ name: "Balance", dataset, query: overdueQuery(as) }],
    },
    rows.parse(question("overdue-balances").rows).map((row) => ({
      customerName: row["customerName"] ?? null,
      [as]: row["overdueCents"] ?? null,
    }))
  );
}

/** The kpi of the overdue total, under the given title and series name. */
function total(title: string, name: string): AnswerChart {
  return drawn(
    {
      type: "kpi",
      title,
      series: [
        {
          name,
          dataset: "invoices.invoices",
          query: {
            filters: [{ field: "overdue", op: "eq", value: true }],
            aggregates: [
              { fn: "sum", field: "outstandingCents", as: "overdueCents" },
            ],
          },
          value: "overdueCents",
        },
      ],
    },
    [{ [name]: question("overdue-balances").totalCents ?? null }]
  );
}

/** The two charts of the recorded answer to `overdue-balances`. */
function overdueBalances(): [AnswerChart, AnswerChart] {
  return [
    balances(
      "Overdue balance by customer",
      "invoices.invoices",
      "overdueCents"
    ),
    total("Overdue total", "Overdue"),
  ];
}

/** One single-series line chart by month, with the expected monthly values of `key`. */
function monthly(dataset: string, field: string, date: string, key: string) {
  return drawn(
    {
      type: "line",
      title: `${key} each month`,
      series: [
        {
          name: "Amount",
          dataset,
          query: {
            groupBy: [{ field: date, bucket: "month" }],
            aggregates: [{ fn: "sum", field, as: "amount" }],
          },
          x: date,
          y: "amount",
        },
      ],
    },
    rows
      .parse(question("monthly-invoiced-and-collected").rows)
      .map((row) => ({ x: `${row["month"]}-01`, Amount: row[key] ?? null }))
  );
}

describe("the answer scorer", () => {
  it("passes the exact answer", () => {
    expect(scoreAnswer("overdue-balances", overdueBalances())).toEqual({
      pass: true,
    });
  });

  it("passes an answer whose charts carry their own titles, series names and aliases", () => {
    const charts = [
      balances("Customers with money overdue", "invoices.invoices", "owed"),
      total("Total past due", "Past due"),
    ];

    expect(scoreAnswer("overdue-balances", charts)).toEqual({ pass: true });
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Overdue total", pass: true },
    ]);
  });

  it("passes the monthly answer drawn as two charts of one series each", () => {
    const charts = [
      monthly(
        "invoices.invoices",
        "totalCents",
        "invoiceDate",
        "invoicedCents"
      ),
      monthly(
        "invoices.payments",
        "amountCents",
        "paymentDate",
        "collectedCents"
      ),
    ];

    expect(scoreAnswer("monthly-invoiced-and-collected", charts)).toEqual({
      pass: true,
    });
    expect(
      scoreCharts("monthly-invoiced-and-collected", charts).map(
        (chart) => chart.pass
      )
    ).toEqual([true, true]);
  });

  it("fails a monthly answer whose chart answers a month twice", () => {
    const invoiced = monthly(
      "invoices.invoices",
      "totalCents",
      "invoiceDate",
      "invoicedCents"
    );

    // A day bucket answers each month on several rows; only the last day matches the file.
    const days = {
      config: invoiced.config,
      data: {
        rows: invoiced.data.rows.flatMap((row) => [
          { x: String(row["x"]).replace(/01$/, "02"), Amount: 1 },
          row,
        ]),
      },
    };

    expect(
      scoreAnswer("monthly-invoiced-and-collected", [
        days,
        monthly(
          "invoices.payments",
          "amountCents",
          "paymentDate",
          "collectedCents"
        ),
      ]).pass
    ).toBe(false);
  });

  it("fails an answer with one row's cents changed", () => {
    const [table, kpi] = overdueBalances();

    const changed = table.data.rows.map((row, index) =>
      index === 0
        ? { ...row, overdueCents: Number(row["overdueCents"]) + 1 }
        : row
    );

    expect(
      scoreAnswer("overdue-balances", [
        { config: table.config, data: { rows: changed } },
        kpi,
      ]).pass
    ).toBe(false);
  });

  it("fails an answer with a row dropped", () => {
    const [table, kpi] = overdueBalances();

    expect(
      scoreAnswer("overdue-balances", [
        { config: table.config, data: { rows: table.data.rows.slice(1) } },
        kpi,
      ]).pass
    ).toBe(false);
  });

  it("fails an answer and its chart case when a chart is missing, and names it", () => {
    const charts = overdueBalances().slice(0, 1);

    expect(scoreAnswer("overdue-balances", charts)).toEqual({
      pass: false,
      reason: "The answer has no chart Overdue total.",
    });
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Overdue total", pass: false, reason: "missing" },
    ]);
  });

  it("does not take a chart of another dataset under the expected title", () => {
    const charts = [
      balances(
        "Overdue balance by customer",
        "invoices.payments",
        "overdueCents"
      ),
      total("Overdue total", "Overdue"),
    ];

    expect(scoreAnswer("overdue-balances", charts).pass).toBe(false);
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: false, reason: "missing" },
      { title: "Overdue total", pass: true },
    ]);
  });

  it("fails a chart case whose chart the gate refused, with the refusal", () => {
    const [table, kpi] = overdueBalances();

    expect(
      scoreCharts("overdue-balances", [
        table,
        { config: kpi.config, refused: "chart-invalid" },
      ])
    ).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Overdue total", pass: false, reason: "chart-invalid" },
    ]);
  });
});
