import { readFileSync } from "node:fs";

import {
  callProcedure,
  type ChartType,
  createAgentRouter,
  type DatasetQuery,
  type DatasetSummary,
  type ModuleRequestContext,
  type PanelConfig,
} from "@genie/core";
import type { AnswerBlock } from "@genie/core/testing";
import { DEMO_PACK } from "@genie/module-invoices/testing";
import { formatChartValue } from "@genie/ui/chart-data";
import { escapeRegExp } from "es-toolkit";

/**
 * The nine read questions of the invoice demo and how each answer's checked charts read back into
 * the shape of `expected-answers.json`. The answer integration test and the model evaluation
 * (`tools/evaluation/`, S7-14) both score with these, so the readers exist once.
 */
export type Question = {
  readonly id: string;
  readonly prompt: string;
  readonly rows: unknown;
  readonly totalCents?: number;
};

// SAFETY: the module's expected-answers file is read verbatim, and these readers own its shape.
const EXPECTED = JSON.parse(
  readFileSync(new URL("../expected-answers.json", DEMO_PACK), "utf8")
) as { readonly currency: string; readonly questions: readonly Question[] };

export const QUESTIONS = EXPECTED.questions;

/** The pack's chatbot prompts: a follow-up shares its session with the question before it. */
export const SESSIONS: readonly (readonly string[])[] = [
  ["overdue-invoices"],
  ["repeated-late-payers", "overdue-balances"],
  ["monthly-invoiced-and-collected"],
  ["top-customers-by-sales", "top-customers-overdue"],
  ["invoices-without-due-date", "manual-due-dates"],
  ["partial-payments"],
];

export function question(id: string): Question {
  const found = QUESTIONS.find((candidate) => candidate.id === id);

  if (found === undefined) throw new Error(`No expected answer ${id}.`);

  return found;
}

/** The agent procedures as the given person. */
export function agentFor(ctx: ModuleRequestContext, requestId: string) {
  return callProcedure(createAgentRouter(), { ...ctx, requestId });
}

type CheckedChart = Awaited<ReturnType<ReturnType<typeof agentFor>["chart"]>>;

type Row = CheckedChart["data"]["rows"][number];

/** A chart of an answer that the gate accepted: the model's config and the rows it answered. */
export type AnswerChart = {
  readonly config: PanelConfig;
  readonly data: { readonly rows: readonly Row[] };
};

export type Answered = { readonly rows: unknown };

/**
 * The charts that a turn of a session can read: its own first, then those of the earlier turns,
 * newest first, so a follow-up builds on an earlier chart or table (`czjw.59` ruling 4).
 */
export function sessionCharts<T>(
  turns: readonly (readonly T[])[]
): readonly T[] {
  return turns.toReversed().flat();
}

/** Each dataset name, and each field name that a person would not write (it holds a capital). */
export function internalNamesOf(
  datasets: readonly DatasetSummary[]
): readonly string[] {
  return [
    ...new Set(
      datasets.flatMap(({ name, fields }) => [
        name,
        ...Object.keys(fields).filter((field) => /[A-Z]/.test(field)),
      ])
    ),
  ];
}

// The digits inside a record number such as INV-2026-10-03 are no date.
const ISO_DATE = /(?<![A-Za-z0-9-])\d{4}-\d{2}-\d{2}(?![0-9-])/g;

/**
 * What breaks the answer rules (Spec 7 R-44): the answer opens with a sentence, a money answer
 * states its total in that first sentence, and the text names no dataset or field and writes no
 * ISO date (I17). No issue is an empty list.
 */
export function answerIssues(input: {
  readonly questionId: string;
  readonly blocks: readonly AnswerBlock[];
  readonly internalNames: readonly string[];
}): readonly string[] {
  const [first] = input.blocks;
  const opening = first?.kind === "Paragraph" ? first.text : undefined;
  const issues: string[] = [];

  if (opening === undefined) {
    issues.push("The answer does not open with a sentence.");
  }

  const { totalCents } = question(input.questionId);

  if (totalCents !== undefined) {
    const amount = formatChartValue(
      {
        key: "total",
        label: "Total",
        type: "money",
        currency: EXPECTED.currency,
      },
      totalCents,
      { bare: true }
    );

    // A sentence ends at a stop before a space, so the stop inside 27,350.00 ends none.
    const [sentence = ""] = (opening ?? "").split(/(?<=[.!?])\s/);

    // The currency, then exactly this amount: no digit before or after it, and no other code.
    const stated = new RegExp(
      `\\b${EXPECTED.currency}\\s?${escapeRegExp(amount)}(?![\\d.,]*\\d)`
    );

    if (!stated.test(sentence)) {
      issues.push(`The first sentence does not state the total ${amount}.`);
    }
  }

  const prose = input.blocks.map(({ text }) => text).join("\n");

  for (const name of input.internalNames) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(prose)) {
      issues.push(`The text names ${name}.`);
    }
  }

  for (const date of new Set(prose.match(ISO_DATE))) {
    issues.push(`The text writes the date ${date}.`);
  }

  return issues;
}

/**
 * A chart that an answer must hold (`czjw.56`): one of `types`, with a series of `dataset` that
 * answers every field in `columns`. `columns` maps each name of `expected-answers.json` to its
 * dataset field, written `fn(field)` for an aggregate. A model names its charts, series and
 * aggregates as it likes, so `title` only labels the chart case in the report.
 */
export type ChartSpec = {
  readonly title: string;
  readonly types: readonly ChartType[];
  readonly dataset: string;
  readonly columns: Readonly<Record<string, string>>;
};

/** Each field that a query answers, `field` or `fn(field)`, with the column it answers under. */
function answeredColumns(query: DatasetQuery): Map<string, string> {
  return new Map([
    ...(query.select ?? []).map((field) => [field, field] as const),
    ...(query.groupBy ?? []).map(({ field }) => [field, field] as const),
    ...(query.aggregates ?? []).map(
      ({ fn, field, as }) => [`${fn}(${field ?? ""})`, as] as const
    ),
  ]);
}

/**
 * The row key of each field that a series of the chart answers. A table keeps the query's columns.
 * A drawn chart answers its x or category under "x" and its value under the series name.
 */
function seriesKeys(
  config: PanelConfig
): readonly { dataset: string; keys: Map<string, string> }[] {
  const all: readonly PanelConfig["series"][number][] = config.series;

  return all.map((series) => {
    const answered = answeredColumns(series.query);

    if (config.type === "table")
      return { dataset: series.dataset, keys: answered };

    const drawn = new Map(
      "x" in series
        ? [
            [series.x, "x"],
            [series.y, series.name],
          ]
        : "category" in series
          ? [
              [series.category, "x"],
              [series.value, series.name],
            ]
          : "value" in series
            ? [[series.value, series.name]]
            : []
    );

    return {
      dataset: series.dataset,
      keys: new Map(
        [...answered].flatMap(([field, column]) => {
          const key = drawn.get(column);

          return key === undefined ? [] : [[field, key] as const];
        })
      ),
    };
  });
}

/** The row key of each field of the spec, when the config shows it; otherwise `undefined`. */
export function showsChart(
  config: PanelConfig,
  spec: ChartSpec
): Map<string, string> | undefined {
  if (!spec.types.includes(config.type)) return undefined;

  return seriesKeys(config).find(
    ({ dataset, keys }) =>
      dataset === spec.dataset &&
      Object.values(spec.columns).every((field) => keys.has(field))
  )?.keys;
}

/** The rows of the first chart that shows the spec, under the names of `expected-answers.json`. */
export function read(charts: readonly AnswerChart[], spec: ChartSpec): Row[] {
  for (const { config, data } of charts) {
    const keys = showsChart(config, spec);

    if (keys !== undefined) {
      return data.rows.map((row) =>
        Object.fromEntries(
          Object.entries(spec.columns).map(([name, field]) => [
            name,
            row[keys.get(field) ?? field] ?? null,
          ])
        )
      );
    }
  }

  throw new Error(`The answer has no chart ${spec.title}.`);
}

const same = (...names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, name]));

const TABLE = ["table"] as const;

const INVOICES = "invoices.invoices";

/** The charts that the nine answers read. */
export const CHARTS = {
  overdueInvoices: {
    title: "Overdue invoices",
    types: TABLE,
    dataset: INVOICES,
    columns: same(
      "customerName",
      "invoiceNumber",
      "outstandingCents",
      "dueDate",
      "daysOverdue"
    ),
  },
  latePayment: {
    title: "Late payment by customer",
    types: TABLE,
    dataset: "invoices.customers",
    columns: {
      customerName: "name",
      ...same("settledWithDueDateCount", "paidLateCount"),
    },
  },
  overdueBalances: {
    title: "Overdue balance by customer",
    types: TABLE,
    dataset: INVOICES,
    columns: {
      customerName: "customerName",
      overdueCents: "sum(outstandingCents)",
    },
  },
  invoicedByMonth: {
    title: "Invoiced sales by month",
    types: ["bar", "line", "area"],
    dataset: INVOICES,
    columns: { month: "invoiceDate", invoicedCents: "sum(totalCents)" },
  },
  collectedByMonth: {
    title: "Collections by month",
    types: ["bar", "line", "area"],
    dataset: "invoices.payments",
    columns: { month: "paymentDate", collectedCents: "sum(amountCents)" },
  },
  salesByCustomer: {
    title: "Invoiced sales by customer",
    types: TABLE,
    dataset: INVOICES,
    columns: { customerName: "customerName", invoicedCents: "sum(totalCents)" },
  },
  noDueDate: {
    title: "Invoices with no due date",
    types: TABLE,
    dataset: INVOICES,
    columns: same(
      "invoiceNumber",
      "customerName",
      "totalCents",
      "outstandingCents"
    ),
  },
  manualDueDates: {
    title: "Due dates entered by a person",
    types: TABLE,
    dataset: INVOICES,
    columns: same(
      "invoiceNumber",
      "customerName",
      "dueDate",
      "outstandingCents"
    ),
  },
  partialPayments: {
    title: "Invoices with partial payments",
    types: TABLE,
    dataset: INVOICES,
    columns: same(
      "invoiceNumber",
      "customerName",
      "totalCents",
      "allocatedCents",
      "outstandingCents"
    ),
  },
  allocations: {
    title: "Allocations to those invoices",
    types: TABLE,
    dataset: "invoices.allocations",
    columns: same(
      "invoiceNumber",
      "paymentReference",
      "paymentDate",
      "amountCents"
    ),
  },
} satisfies Record<string, ChartSpec>;

// Top means the three largest by invoiced sales (`expected-answers.json`), so a full ranking
// and a top-three table read the same.
const topSales = (charts: readonly AnswerChart[]) =>
  read(charts, CHARTS.salesByCustomer).slice(0, 3);

/** Each answer's checked charts in the shape of its question in `expected-answers.json`. */
export type Reader = (charts: readonly AnswerChart[]) => Answered;

export const READERS = new Map<string, Reader>(
  Object.entries({
    "overdue-invoices": (c) => ({ rows: read(c, CHARTS.overdueInvoices) }),
    "repeated-late-payers": (c) => ({
      // The qualifying customers, so a table of all of them and one of these read the same.
      rows: read(c, CHARTS.latePayment)
        .map((row) =>
          Object.assign(row, {
            // The README definition: late on more than half of the settled invoices with a due date.
            repeatedLatePayer:
              Number(row["paidLateCount"]) * 2 >
              Number(row["settledWithDueDateCount"]),
          })
        )
        .filter((row) => row["repeatedLatePayer"] === true),
    }),
    "overdue-balances": (c) => ({ rows: read(c, CHARTS.overdueBalances) }),
    "monthly-invoiced-and-collected": (c) => {
      // Core answers a month bucket as its first day; the file names the month. A model can draw
      // both series in one chart or in two.
      const byMonth = (spec: ChartSpec, key: string) => {
        const rows = read(c, spec);

        const months = new Map(
          rows.map((row) => [
            String(row["month"]).slice(0, 7),
            row[key] ?? null,
          ])
        );

        // A chart grouped finer than a month would otherwise keep only its last row per month.
        if (months.size !== rows.length) {
          throw new Error(`The chart ${spec.title} answers a month twice.`);
        }

        return months;
      };

      const invoiced = byMonth(CHARTS.invoicedByMonth, "invoicedCents");
      const collected = byMonth(CHARTS.collectedByMonth, "collectedCents");

      return {
        rows: [...new Set([...invoiced.keys(), ...collected.keys()])]
          .toSorted()
          .map((month) => ({
            month,
            invoicedCents: invoiced.get(month) ?? null,
            collectedCents: collected.get(month) ?? null,
          })),
      };
    },
    "top-customers-by-sales": (c) => ({ rows: topSales(c) }),
    "top-customers-overdue": (c) => {
      const overdue = new Map(
        read(c, CHARTS.overdueBalances).map((row) => [
          row["customerName"],
          row["overdueCents"],
        ])
      );

      return {
        rows: topSales(c).map((row) =>
          Object.assign(row, {
            overdueCents: overdue.get(row["customerName"] ?? null) ?? 0,
          })
        ),
      };
    },
    "invoices-without-due-date": (c) => ({
      rows: read(c, CHARTS.noDueDate),
    }),
    "manual-due-dates": (c) => ({
      rows: read(c, CHARTS.manualDueDates),
    }),
    "partial-payments": (c) => {
      const allocations = read(c, CHARTS.allocations);

      return {
        rows: read(c, CHARTS.partialPayments).map((row) =>
          Object.assign(row, {
            allocations: allocations
              .filter(
                (allocation) =>
                  allocation["invoiceNumber"] === row["invoiceNumber"]
              )
              .map(({ invoiceNumber: _number, ...allocation }) => allocation),
          })
        ),
      };
    },
  } satisfies Record<string, Reader>)
);

/**
 * The chart cases of the evaluation (R-58, plan D1): each chart that a question's reader reads. A
 * chart case passes when the answer holds a chart that shows it and the R-15 gate accepts it.
 */
export const CHART_CASES: readonly (ChartSpec & {
  readonly questionId: string;
})[] = [
  { questionId: "overdue-invoices", ...CHARTS.overdueInvoices },
  { questionId: "repeated-late-payers", ...CHARTS.latePayment },
  { questionId: "overdue-balances", ...CHARTS.overdueBalances },
  { questionId: "monthly-invoiced-and-collected", ...CHARTS.invoicedByMonth },
  { questionId: "monthly-invoiced-and-collected", ...CHARTS.collectedByMonth },
  { questionId: "top-customers-by-sales", ...CHARTS.salesByCustomer },
  { questionId: "top-customers-overdue", ...CHARTS.overdueBalances },
  { questionId: "top-customers-overdue", ...CHARTS.salesByCustomer },
  { questionId: "invoices-without-due-date", ...CHARTS.noDueDate },
  { questionId: "manual-due-dates", ...CHARTS.manualDueDates },
  { questionId: "partial-payments", ...CHARTS.partialPayments },
  { questionId: "partial-payments", ...CHARTS.allocations },
];
