import {
  AppError,
  CORE_ERRORS,
  type DatasetQuery,
  type PanelConfig,
} from "@genie/core";
import { type AnswerBlock, answerBlocks } from "@genie/core/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AnswerChart,
  answerIssues,
  question,
  sessionCharts,
} from "../../testing/invoice-answer-readers.ts";
import { refusalCode, scoreAnswer, scoreCharts } from "./score-answers.ts";

type Row = Record<string, string | number | null>;

const rows = z.array(
  z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
);

/** The internal names of the four invoice datasets that these cases use. */
const NAMES = [
  "invoices.invoices",
  "invoices.customers",
  "customerName",
  "outstandingCents",
  "totalCents",
];

const paragraph = (text: string): AnswerBlock => ({ kind: "Paragraph", text });

const TOTAL_FIRST = [
  paragraph("3 customers have overdue balances, SGD 27,350.00 in all."),
  paragraph("This sums the amount still owed on the overdue invoices."),
];

/** An answer of the given charts and prose, read as the scorer reads it. */
function answer(
  charts: readonly AnswerChart[],
  blocks: readonly AnswerBlock[] = TOTAL_FIRST
) {
  return { charts, blocks, internalNames: NAMES };
}

/** The prose issues of a no-money answer whose second block is a List of `text`. */
const listIssues = (text: string) =>
  answerIssues({
    questionId: "manual-due-dates",
    blocks: [
      paragraph("1 invoice has a due date that a person entered."),
      { kind: "List", text },
    ],
    internalNames: NAMES,
  });

/** The prose issues of a no-money answer of one Paragraph. */
const paragraphIssues = (text: string) =>
  answerIssues({
    questionId: "partial-payments",
    blocks: [paragraph(text)],
    internalNames: NAMES,
  });

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
function balances(
  title = "Overdue balance by customer",
  dataset = "invoices.invoices",
  as = "overdueCents"
): AnswerChart {
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

/** All six customers by invoiced sales, largest first (the seeded demo history). */
const SALES: readonly Row[] = [
  { customerName: "Apex Digital", invoicedCents: 5670000 },
  { customerName: "Meridian Labs", invoicedCents: 5100000 },
  { customerName: "Harbor Foods", invoicedCents: 4140000 },
  { customerName: "ABC Trading", invoicedCents: 3450000 },
  { customerName: "Lumi Design", invoicedCents: 2895000 },
  { customerName: "Orchid Retail", invoicedCents: 2385000 },
];

function sales(answered: readonly Row[]): AnswerChart {
  return drawn(
    {
      type: "table",
      title: "Top customers",
      series: [
        {
          name: "Sales",
          dataset: "invoices.invoices",
          query: {
            groupBy: [{ field: "customerName" }],
            aggregates: [
              { fn: "sum", field: "totalCents", as: "invoicedCents" },
            ],
            orderBy: [{ column: "invoicedCents", direction: "desc" }],
          },
        },
      ],
    },
    answered
  );
}

/** All six customers with their settled and late counts (the seeded demo history). */
const LATE: readonly Row[] = [
  { name: "ABC Trading", settledWithDueDateCount: 5, paidLateCount: 4 },
  { name: "Apex Digital", settledWithDueDateCount: 6, paidLateCount: 0 },
  { name: "Harbor Foods", settledWithDueDateCount: 4, paidLateCount: 4 },
  { name: "Lumi Design", settledWithDueDateCount: 6, paidLateCount: 0 },
  { name: "Meridian Labs", settledWithDueDateCount: 5, paidLateCount: 2 },
  { name: "Orchid Retail", settledWithDueDateCount: 3, paidLateCount: 3 },
];

function late(answered: readonly Row[]): AnswerChart {
  return drawn(
    {
      type: "table",
      title: "Late payers",
      series: [
        {
          name: "Customers",
          dataset: "invoices.customers",
          query: {
            select: ["name", "settledWithDueDateCount", "paidLateCount"],
          },
        },
      ],
    },
    answered
  );
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

const invoicedMonthly = () =>
  monthly("invoices.invoices", "totalCents", "invoiceDate", "invoicedCents");

const collectedMonthly = () =>
  monthly("invoices.payments", "amountCents", "paymentDate", "collectedCents");

describe("the answer scorer", () => {
  it("reads every block of an answer in reading order", () => {
    const text = [
      "root = Answer([title, result, method, rows, figure])",
      'title = Heading("Open items")',
      'result = Paragraph("12 open items, SGD 4,200.00 in all.")',
      'method = Paragraph("This counts the open items as of 27 Oct 2026.")',
      'rows = List(["First item", "Second item"])',
      'figure = Chart({type: "kpi", title: "Open items", series: [{name: "Open items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
    ].join("\n");

    expect(answerBlocks(text)).toEqual([
      { kind: "Heading", text: "Open items" },
      { kind: "Paragraph", text: "12 open items, SGD 4,200.00 in all." },
      {
        kind: "Paragraph",
        text: "This counts the open items as of 27 Oct 2026.",
      },
      { kind: "List", text: "First item\nSecond item" },
      { kind: "Chart", text: "" },
    ]);
  });

  it("passes the exact answer", () => {
    expect(scoreAnswer("overdue-balances", answer([balances()]))).toEqual({
      pass: true,
    });
  });

  it("passes an answer whose charts carry their own titles, series names and aliases", () => {
    const charts = [
      balances("Customers with money overdue", "invoices.invoices", "owed"),
    ];

    expect(scoreAnswer("overdue-balances", answer(charts))).toEqual({
      pass: true,
    });
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: true },
    ]);
  });

  it("fails a money answer whose first sentence does not state the total", () => {
    const later = [
      paragraph("3 customers have overdue balances. SGD 27,350.00 in all."),
    ];

    const rounded = [paragraph("3 customers owe SGD 27,350 in all.")];

    const heading: AnswerBlock[] = [
      { kind: "Heading", text: "Overdue balances" },
      ...TOTAL_FIRST,
    ];

    for (const blocks of [later, rounded]) {
      expect(
        scoreAnswer("overdue-balances", answer([balances()], blocks))
      ).toEqual({
        pass: false,
        reason: "The first sentence does not state the total 27,350.00.",
      });
    }

    expect(
      scoreAnswer("overdue-balances", answer([balances()], heading))
    ).toEqual({
      pass: false,
      reason:
        "The answer does not open with a sentence.; The first sentence does not state the total 27,350.00.",
    });
  });

  it("names each internal name in the prose, and passes field names that are plain words", () => {
    expect(
      listIssues("From invoices.invoices\nThe outstandingCents of each row")
    ).toEqual([
      "The text names invoices.invoices.",
      "The text names outstandingCents.",
    ]);
    expect(
      listIssues("It is overdue\nIn its own currency\nWith its status open")
    ).toEqual([]);
  });

  it("names an ISO date in the prose, and passes a written date and the record numbers", () => {
    expect(
      paragraphIssues("1 invoice is part paid, as of 2026-10-27.")
    ).toEqual(["The text writes the date 2026-10-27."]);
    expect(
      paragraphIssues(
        "INV-2026-10-03 is part paid as of 27 Oct 2026, by TXN-PAY-2026-026."
      )
    ).toEqual([]);
  });

  it("reads the top three customers from a full ranking and from a top-three table", () => {
    for (const answered of [SALES, SALES.slice(0, 3)]) {
      expect(
        scoreAnswer("top-customers-by-sales", answer([sales(answered)]))
      ).toEqual({ pass: true });
    }
  });

  it("reads the repeated late payers from all customers and from the qualifying ones", () => {
    const qualifying = LATE.filter(
      (row) =>
        Number(row["paidLateCount"]) * 2 >
        Number(row["settledWithDueDateCount"])
    );

    expect(qualifying).toHaveLength(3);

    for (const answered of [LATE, qualifying]) {
      expect(
        scoreAnswer("repeated-late-payers", answer([late(answered)]))
      ).toEqual({ pass: true });
    }
  });

  it("scores a follow-up on the sales table that the earlier turn made", () => {
    const charts = sessionCharts([[sales(SALES)], [balances()]]);

    expect(scoreAnswer("top-customers-overdue", answer(charts))).toEqual({
      pass: true,
    });
    expect(scoreCharts("top-customers-overdue", charts)).toEqual([
      { title: "Overdue balance by customer", pass: true },
      { title: "Invoiced sales by customer", pass: true },
    ]);
  });

  it("passes the monthly answer drawn as two charts of one series each", () => {
    const charts = [invoicedMonthly(), collectedMonthly()];

    expect(
      scoreAnswer("monthly-invoiced-and-collected", answer(charts))
    ).toEqual({ pass: true });
    expect(
      scoreCharts("monthly-invoiced-and-collected", charts).map(
        (chart) => chart.pass
      )
    ).toEqual([true, true]);
  });

  it("fails a monthly answer whose chart answers a month twice", () => {
    const invoiced = invoicedMonthly();

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
      scoreAnswer(
        "monthly-invoiced-and-collected",
        answer([days, collectedMonthly()])
      ).pass
    ).toBe(false);
  });

  it("fails an answer with one row's cents changed", () => {
    const table = balances();

    const changed = table.data.rows.map((row, index) =>
      index === 0
        ? { ...row, overdueCents: Number(row["overdueCents"]) + 1 }
        : row
    );

    expect(
      scoreAnswer(
        "overdue-balances",
        answer([{ config: table.config, data: { rows: changed } }])
      )
    ).toEqual({ pass: false, reason: "wrong-answer" });
  });

  it("fails an answer with a row dropped", () => {
    const table = balances();

    expect(
      scoreAnswer(
        "overdue-balances",
        answer([
          { config: table.config, data: { rows: table.data.rows.slice(1) } },
        ])
      ).pass
    ).toBe(false);
  });

  it("fails an answer and its chart case when a table is missing, and names it", () => {
    expect(scoreAnswer("overdue-balances", answer([]))).toEqual({
      pass: false,
      reason: "The answer has no chart Overdue balance by customer.",
    });
    expect(scoreCharts("overdue-balances", [])).toEqual([
      { title: "Overdue balance by customer", pass: false, reason: "missing" },
    ]);
  });

  it("does not take a chart of another dataset under the expected title", () => {
    const charts = [
      balances("Overdue balance by customer", "invoices.payments"),
    ];

    expect(scoreAnswer("overdue-balances", answer(charts)).pass).toBe(false);
    expect(scoreCharts("overdue-balances", charts)).toEqual([
      { title: "Overdue balance by customer", pass: false, reason: "missing" },
    ]);
  });

  it("fails a chart case whose chart the gate refused, with the refusal", () => {
    expect(
      scoreCharts("overdue-balances", [
        { config: balances().config, refused: "chart-invalid" },
      ])
    ).toEqual([
      {
        title: "Overdue balance by customer",
        pass: false,
        reason: "chart-invalid",
      },
    ]);
  });

  it("names a refused chart by the app code, and an error that is no refusal by its message", () => {
    const timeout = Object.assign(new Error("canceling statement"), {
      code: "57014",
    });

    expect(
      [
        new AppError(CORE_ERRORS["invalid-input"]),
        new Error("Internal server error", {
          cause: new AppError(CORE_ERRORS["invalid-input"]),
        }),
        timeout,
      ].map((error) => refusalCode(error))
    ).toEqual(["invalid-input", "invalid-input", "Error: canceling statement"]);
  });
});
