import { readFileSync } from "node:fs";

import {
  callProcedure,
  createAgentRouter,
  type ModuleRequestContext,
} from "@genie/core";
import { DEMO_PACK } from "@genie/module-invoices/testing";

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
export const QUESTIONS = (
  JSON.parse(
    readFileSync(new URL("../expected-answers.json", DEMO_PACK), "utf8")
  ) as { readonly questions: readonly Question[] }
).questions;

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

export type CheckedChart = Awaited<
  ReturnType<ReturnType<typeof agentFor>["chart"]>
>["data"];

/** The two parts of a checked chart that the readers read. */
export type ChartRows = Pick<CheckedChart, "title" | "rows">;

type Row = CheckedChart["rows"][number];

export type Answered = {
  readonly rows: unknown;
  readonly totalCents?: unknown;
};

export function titled(charts: readonly ChartRows[], title: string) {
  const chart = charts.find((candidate) => candidate.title === title);

  if (chart === undefined) throw new Error(`The answer has no chart ${title}.`);

  return chart;
}

function pick(
  data: { readonly rows: readonly Row[] },
  keys: readonly string[]
): Row[] {
  return data.rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))
  );
}

/** Each answer's checked charts in the shape of its question in `expected-answers.json`. */
export type Reader = (charts: readonly ChartRows[]) => Answered;

export const READERS = new Map<string, Reader>(
  Object.entries({
    "overdue-invoices": (c) => ({
      rows: pick(titled(c, "Overdue invoices"), [
        "customerName",
        "invoiceNumber",
        "outstandingCents",
        "dueDate",
        "daysOverdue",
      ]),
      totalCents: titled(c, "Overdue total").rows[0]?.["Overdue"] ?? null,
    }),
    "repeated-late-payers": (c) => ({
      rows: titled(c, "Late payment by customer").rows.map((row) => ({
        customerName: row["name"] ?? null,
        settledWithDueDateCount: row["settledWithDueDateCount"] ?? null,
        paidLateCount: row["paidLateCount"] ?? null,
        // The README definition: late on more than half of the settled invoices with a due date.
        repeatedLatePayer:
          Number(row["paidLateCount"]) * 2 >
          Number(row["settledWithDueDateCount"]),
      })),
    }),
    "overdue-balances": (c) => ({
      rows: pick(titled(c, "Overdue balance by customer"), [
        "customerName",
        "overdueCents",
      ]),
      totalCents: titled(c, "Overdue total").rows[0]?.["Overdue"] ?? null,
    }),
    "monthly-invoiced-and-collected": (c) => ({
      rows: titled(c, "Invoiced sales and collections by month").rows.map(
        (row) => ({
          // Core answers a month bucket as its first day; the file names the month.
          month: String(row["x"]).slice(0, 7),
          invoicedCents: row["Invoiced sales"] ?? null,
          collectedCents: row["Collections"] ?? null,
        })
      ),
    }),
    "top-customers-by-sales": (c) => ({
      rows: pick(titled(c, "Invoiced sales by customer"), [
        "customerName",
        "invoicedCents",
      ]),
    }),
    "top-customers-overdue": (c) => {
      const overdue = new Map(
        titled(c, "Overdue balance by customer").rows.map((row) => [
          row["customerName"],
          row["overdueCents"],
        ])
      );

      return {
        rows: titled(c, "Top three customers by invoiced sales").rows.map(
          (row) => ({
            customerName: row["customerName"] ?? null,
            invoicedCents: row["invoicedCents"] ?? null,
            overdueCents: overdue.get(row["customerName"] ?? null) ?? 0,
          })
        ),
      };
    },
    "invoices-without-due-date": (c) => ({
      rows: pick(titled(c, "Invoices with no due date"), [
        "invoiceNumber",
        "customerName",
        "totalCents",
        "outstandingCents",
      ]),
    }),
    "manual-due-dates": (c) => ({
      rows: pick(titled(c, "Due dates entered by a person"), [
        "invoiceNumber",
        "customerName",
        "dueDate",
      ]),
    }),
    "partial-payments": (c) => {
      const allocations = titled(c, "Allocations to those invoices").rows;

      return {
        rows: pick(titled(c, "Invoices with partial payments"), [
          "invoiceNumber",
          "customerName",
          "totalCents",
          "allocatedCents",
          "outstandingCents",
        ]).map((row) =>
          Object.assign(row, {
            allocations: pick(
              {
                rows: allocations.filter(
                  (allocation) =>
                    allocation["invoiceNumber"] === row["invoiceNumber"]
                ),
              },
              ["paymentReference", "paymentDate", "amountCents"]
            ),
          })
        ),
      };
    },
  } satisfies Record<string, Reader>)
);

/**
 * The chart cases of the evaluation (R-58, plan D1): each chart title that a question's reader
 * asks for. A chart case passes when the answer holds that chart and the R-15 gate accepts it.
 */
export const CHART_CASES: readonly {
  readonly questionId: string;
  readonly title: string;
}[] = [
  { questionId: "overdue-invoices", title: "Overdue invoices" },
  { questionId: "overdue-invoices", title: "Overdue total" },
  { questionId: "repeated-late-payers", title: "Late payment by customer" },
  { questionId: "overdue-balances", title: "Overdue balance by customer" },
  { questionId: "overdue-balances", title: "Overdue total" },
  {
    questionId: "monthly-invoiced-and-collected",
    title: "Invoiced sales and collections by month",
  },
  { questionId: "top-customers-by-sales", title: "Invoiced sales by customer" },
  { questionId: "top-customers-overdue", title: "Overdue balance by customer" },
  {
    questionId: "top-customers-overdue",
    title: "Top three customers by invoiced sales",
  },
  {
    questionId: "invoices-without-due-date",
    title: "Invoices with no due date",
  },
  { questionId: "manual-due-dates", title: "Due dates entered by a person" },
  { questionId: "partial-payments", title: "Invoices with partial payments" },
  { questionId: "partial-payments", title: "Allocations to those invoices" },
];
