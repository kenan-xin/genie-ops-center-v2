import { readFileSync } from "node:fs";

import {
  createTenantContext,
  type DatasetFilter,
  type DatasetQuery,
  type ModuleRequestContext,
  principalFor,
  queryDataset,
  queryDatasetSeries,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  type JsonValue,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import {
  DEMO_PACK,
  type DemoHistoryIds,
  readDemoCsv,
  readDemoJson,
  saveDemoHistory,
  toCents,
} from "./demo-pack.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The demo pack history saved through the procedures at reporting date 2026-10-27, read back
 * through the four datasets (AC-6, R-9, R-36). Every expected figure comes from the pack's own
 * files or from `expected-answers.json`, never from this module's formulas.
 */
type Baseline = {
  readonly totals: {
    readonly invoice_count: number;
    readonly payment_count: number;
    readonly total_invoiced: number;
    readonly total_collected: number;
    readonly outstanding: number;
    readonly overdue: number;
    readonly due_date_unspecified: number;
    readonly october: {
      readonly month: string;
      readonly invoiced_sales: number;
      readonly payments_collected: number;
    };
  };
  readonly customer_payment_behaviour: readonly {
    readonly customer_id: string;
    readonly company_name: string;
    readonly settled_with_known_due_date: number;
    readonly settled_late_count: number;
    readonly late_payment_rate: number;
    readonly outstanding_amount: number;
    readonly overdue_amount: number;
    readonly unknown_due_date_amount: number;
  }[];
  readonly monthly_totals: readonly {
    readonly month: string;
    readonly invoiced_sales: number;
    readonly payments_collected: number;
  }[];
};

type Question = {
  readonly id: string;
  readonly prompt: string;
  readonly measures: readonly string[];
  readonly rows: Rows;
  readonly totalCents?: number;
  readonly note?: string;
};

type ExpectedAnswers = {
  readonly reportingDate: string;
  readonly currency: string;
  readonly source: string;
  readonly questions: readonly Question[];
};

type Rows = readonly Readonly<Record<string, JsonValue>>[];

// SAFETY: the demo pack's expected files are read verbatim and this test owns their shapes.
const BASELINE = readDemoJson(
  "04_Demo_Guide/expected_baseline_answers.json"
) as Baseline;

// SAFETY: the expected-answers file beside the pack is read verbatim and this test owns its shape.
const ANSWERS = JSON.parse(
  readFileSync(new URL("../expected-answers.json", DEMO_PACK), "utf8")
) as ExpectedAnswers;

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** Built after the reporting date was set, so its settings reader sees it (DEC-46). */
let tenant: TenantContext;

let financeUserId: string;

let ids: DemoHistoryIds;

function contextFor(userId: string): ModuleRequestContext {
  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  };
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  const setup = deployment.context;

  await markSetupDone(setup);
  await enableModules(setup, ["invoices"]);
  await setup.db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  tenant = createTenantContext(
    {
      DATABASE_URL: setup.env.databaseUrl,
      PUBLIC_URL: setup.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["invoices"]
  );
  registerModuleRuntime(tenant, [invoicesModule]);
  ({ userId: financeUserId } = await insertPersonWith(tenant, [
    "invoices:read",
    "invoices:write",
  ]));
  ids = await saveDemoHistory(contextFor(financeUserId));
}, 120000);

afterAll(async () => {
  await tenant?.db.$client.end();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

async function rows(dataset: string, query: DatasetQuery): Promise<Rows> {
  return (await queryDataset(contextFor(financeUserId), { dataset, query }))
    .rows;
}

async function total(
  dataset: string,
  field: string,
  filters: readonly DatasetFilter[] = []
): Promise<number> {
  const [row] = await rows(dataset, {
    filters,
    aggregates: [{ fn: "sum", field, as: "total" }],
  });

  return Number(row?.total ?? 0);
}

async function count(dataset: string): Promise<number> {
  const [row] = await rows(dataset, {
    aggregates: [{ fn: "count", as: "count" }],
  });

  return Number(row?.count ?? 0);
}

/** The sum of outstanding cents per customer name, from the invoices dataset grouped by name. */
async function outstandingByCustomer(
  filters: readonly DatasetFilter[],
  as: string
): Promise<ReadonlyMap<string, number>> {
  return new Map(
    (
      await rows("invoices.invoices", {
        filters,
        groupBy: [{ field: "customerName" }],
        aggregates: [{ fn: "sum", field: "outstandingCents", as }],
      })
    ).map((row) => [String(row.customerName), Number(row[as] ?? 0)])
  );
}

/** Invoiced sales and collections by month, one series query as the datasets answer them. */
function monthlySeries() {
  return queryDatasetSeries(contextFor(financeUserId), {
    series: [
      {
        name: "invoiced",
        dataset: "invoices.invoices",
        query: {
          groupBy: [{ field: "invoiceDate", bucket: "month" }],
          aggregates: [{ fn: "sum", field: "totalCents", as: "cents" }],
        },
      },
      {
        name: "collected",
        dataset: "invoices.payments",
        query: {
          groupBy: [{ field: "paymentDate", bucket: "month" }],
          aggregates: [{ fn: "sum", field: "amountCents", as: "cents" }],
        },
      },
    ],
  });
}

describe("demo history", () => {
  it("gives every total in expected_baseline_answers.json at 2026-10-27", async () => {
    const { totals } = BASELINE;

    expect(await count("invoices.invoices")).toBe(totals.invoice_count);
    expect(await count("invoices.payments")).toBe(totals.payment_count);
    expect(await total("invoices.invoices", "totalCents")).toBe(
      toCents(totals.total_invoiced)
    );
    expect(await total("invoices.payments", "amountCents")).toBe(
      toCents(totals.total_collected)
    );
    expect(await total("invoices.invoices", "outstandingCents")).toBe(
      toCents(totals.outstanding)
    );
    expect(
      await total("invoices.invoices", "outstandingCents", [
        { field: "overdue", op: "eq", value: true },
      ])
    ).toBe(toCents(totals.overdue));
    expect(
      await total("invoices.invoices", "outstandingCents", [
        { field: "dueDate", op: "isNull" },
      ])
    ).toBe(toCents(totals.due_date_unspecified));

    expect(
      await total("invoices.invoices", "totalCents", [
        {
          field: "invoiceDate",
          op: "between",
          from: "2026-10-01",
          to: "2026-10-31",
        },
      ])
    ).toBe(toCents(totals.october.invoiced_sales));
    expect(
      await total("invoices.payments", "amountCents", [
        {
          field: "paymentDate",
          op: "between",
          from: "2026-10-01",
          to: "2026-10-31",
        },
      ])
    ).toBe(toCents(totals.october.payments_collected));

    // Core answers a month bucket as its first day, so "2026-05" is the x value "2026-05-01".
    expect((await monthlySeries()).rows).toEqual(
      BASELINE.monthly_totals.map((month) => ({
        x: `${month.month}-01`,
        invoiced: toCents(month.invoiced_sales),
        collected: toCents(month.payments_collected),
      }))
    );

    const outstanding = await outstandingByCustomer([], "outstandingCents");
    const overdue = await outstandingByCustomer(
      [{ field: "overdue", op: "eq", value: true }],
      "overdueCents"
    );
    const unknown = await outstandingByCustomer(
      [{ field: "dueDate", op: "isNull" }],
      "unknownCents"
    );

    for (const expected of BASELINE.customer_payment_behaviour) {
      const customerId = ids.customers.get(expected.customer_id);

      if (customerId === undefined) {
        throw new Error(
          `The demo history saved no customer ${expected.customer_id}.`
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- one customer of the pack at a time reads clearly.
      const [counts] = await rows("invoices.customers", {
        select: ["settledWithDueDateCount", "paidLateCount"],
        filters: [{ field: "id", op: "eq", value: customerId }],
      });

      if (counts === undefined) {
        throw new Error(`The customer ${expected.customer_id} has no row.`);
      }

      const settled = Number(counts.settledWithDueDateCount);
      const late = Number(counts.paidLateCount);
      const rate = settled === 0 ? 0 : late / settled;

      expect(settled).toBe(expected.settled_with_known_due_date);
      expect(late).toBe(expected.settled_late_count);
      expect(rate).toBeCloseTo(expected.late_payment_rate, 4);
      expect(outstanding.get(expected.company_name) ?? 0).toBe(
        toCents(expected.outstanding_amount)
      );
      expect(overdue.get(expected.company_name) ?? 0).toBe(
        toCents(expected.overdue_amount)
      );
      expect(unknown.get(expected.company_name) ?? 0).toBe(
        toCents(expected.unknown_due_date_amount)
      );
    }
  });

  it("gives every invoice's outstanding, days overdue and paid-late flag in expected_invoice_status.csv", async () => {
    const expected = readDemoCsv("04_Demo_Guide/expected_invoice_status.csv");
    const actual = await rows("invoices.invoices", {
      select: ["invoiceNumber", "outstandingCents", "daysOverdue", "paidLate"],
      filters: [
        {
          field: "invoiceNumber",
          op: "in",
          values: expected.map((row) => row.invoice_id ?? ""),
        },
      ],
    });
    const byNumber = new Map(
      actual.map((row) => [String(row.invoiceNumber), row])
    );

    expect(
      expected.map((row) => {
        const invoice = byNumber.get(row.invoice_id ?? "");

        if (invoice === undefined) {
          throw new Error(
            `The demo history saved no invoice ${row.invoice_id}.`
          );
        }

        return {
          invoiceNumber: invoice.invoiceNumber,
          outstandingCents: invoice.outstandingCents,
          daysOverdue: invoice.daysOverdue,
          paidLate: invoice.paidLate,
        };
      })
    ).toEqual(
      expected.map((row) => ({
        invoiceNumber: row.invoice_id,
        outstandingCents: toCents(Number(row.outstanding_amount)),
        // The CSV writes 0 or a blank unless the invoice is overdue.
        daysOverdue: row.status === "overdue" ? Number(row.days_overdue) : null,
        // A blank settled_late is null: the invoice is part-paid or has no due date.
        paidLate:
          row.settled_late === "true"
            ? true
            : row.settled_late === "false"
              ? false
              : null,
      }))
    );
  });

  const answers = new Map<string, () => Promise<Rows>>([
    [
      "overdue-invoices",
      () =>
        rows("invoices.invoices", {
          select: [
            "customerName",
            "invoiceNumber",
            "outstandingCents",
            "dueDate",
            "daysOverdue",
          ],
          filters: [{ field: "overdue", op: "eq", value: true }],
          orderBy: [{ column: "daysOverdue", direction: "desc" }],
        }),
    ],
    [
      "repeated-late-payers",
      async () =>
        (
          await rows("invoices.customers", {
            select: ["name", "settledWithDueDateCount", "paidLateCount"],
            orderBy: [{ column: "name", direction: "asc" }],
          })
        ).map((row) => ({
          customerName: row.name ?? null,
          settledWithDueDateCount: row.settledWithDueDateCount ?? null,
          paidLateCount: row.paidLateCount ?? null,
          // Decision 17: repeatedly means two or more late settlements.
          repeatedLatePayer: Number(row.paidLateCount) >= 2,
        })),
    ],
    [
      "overdue-balances",
      () =>
        rows("invoices.invoices", {
          filters: [{ field: "overdue", op: "eq", value: true }],
          groupBy: [{ field: "customerName" }],
          aggregates: [
            { fn: "sum", field: "outstandingCents", as: "overdueCents" },
          ],
          orderBy: [{ column: "overdueCents", direction: "desc" }],
        }),
    ],
    [
      "monthly-invoiced-and-collected",
      async () =>
        (await monthlySeries()).rows.map((row) => ({
          // Core answers a month bucket as its first day; the file names the month.
          month: String(row.x).slice(0, 7),
          invoicedCents: row.invoiced ?? null,
          collectedCents: row.collected ?? null,
        })),
    ],
    [
      "top-customers-by-sales",
      () =>
        rows("invoices.invoices", {
          groupBy: [{ field: "customerName" }],
          aggregates: [{ fn: "sum", field: "totalCents", as: "invoicedCents" }],
          orderBy: [{ column: "invoicedCents", direction: "desc" }],
        }),
    ],
    [
      "top-customers-overdue",
      async () => {
        const top = await rows("invoices.invoices", {
          groupBy: [{ field: "customerName" }],
          aggregates: [{ fn: "sum", field: "totalCents", as: "invoicedCents" }],
          orderBy: [{ column: "invoicedCents", direction: "desc" }],
          // Decision 17: top means the three largest by invoiced sales.
          limit: 3,
        });
        const overdue = new Map(
          (
            await rows("invoices.invoices", {
              filters: [{ field: "overdue", op: "eq", value: true }],
              groupBy: [{ field: "customerName" }],
              aggregates: [
                { fn: "sum", field: "outstandingCents", as: "overdueCents" },
              ],
            })
          ).map((row) => [
            String(row.customerName),
            Number(row.overdueCents ?? 0),
          ])
        );

        return top.map((row) => ({
          customerName: row.customerName ?? null,
          invoicedCents: row.invoicedCents ?? null,
          overdueCents: overdue.get(String(row.customerName)) ?? 0,
        }));
      },
    ],
    [
      "invoices-without-due-date",
      () =>
        rows("invoices.invoices", {
          select: [
            "invoiceNumber",
            "customerName",
            "totalCents",
            "outstandingCents",
          ],
          filters: [{ field: "dueDate", op: "isNull" }],
        }),
    ],
    [
      "manual-due-dates",
      () =>
        rows("invoices.invoices", {
          select: ["invoiceNumber", "customerName", "dueDate"],
          filters: [{ field: "dueDateSource", op: "eq", value: "person" }],
        }),
    ],
    [
      "partial-payments",
      async () => {
        const partial = await rows("invoices.invoices", {
          select: [
            "invoiceNumber",
            "customerName",
            "totalCents",
            "allocatedCents",
            "outstandingCents",
          ],
          filters: [
            { field: "allocatedCents", op: "gt", value: 0 },
            { field: "outstandingCents", op: "gt", value: 0 },
          ],
        });
        const numbers = partial.map((row) => String(row.invoiceNumber));
        const allocations =
          numbers.length === 0
            ? []
            : await rows("invoices.allocations", {
                select: [
                  "invoiceNumber",
                  "paymentReference",
                  "paymentDate",
                  "amountCents",
                ],
                filters: [
                  { field: "invoiceNumber", op: "in", values: numbers },
                ],
              });
        const byInvoice = new Map<
          string,
          readonly Readonly<Record<string, JsonValue>>[]
        >();

        for (const allocation of allocations) {
          const number = String(allocation.invoiceNumber);

          byInvoice.set(number, [...(byInvoice.get(number) ?? []), allocation]);
        }

        return partial.map((row) => ({
          invoiceNumber: row.invoiceNumber ?? null,
          customerName: row.customerName ?? null,
          totalCents: row.totalCents ?? null,
          allocatedCents: row.allocatedCents ?? null,
          outstandingCents: row.outstandingCents ?? null,
          allocations: (byInvoice.get(String(row.invoiceNumber)) ?? []).map(
            (allocation) => ({
              paymentReference: allocation.paymentReference ?? null,
              paymentDate: allocation.paymentDate ?? null,
              amountCents: allocation.amountCents ?? null,
            })
          ),
        }));
      },
    ],
  ]);

  it.each(
    ANSWERS.questions.map((question) => [question.id, question] as const)
  )(
    "answers the %s question from expected-answers.json",
    async (id, question) => {
      const answer = answers.get(id);

      if (answer === undefined) {
        throw new Error(`No dataset query answers ${id}.`);
      }

      expect(await answer()).toEqual(question.rows);
    }
  );
});
