import { readFileSync } from "node:fs";

import { callProcedure, type ModuleRequestContext } from "@genie/core";

import { invoicesRouter } from "../src/router.ts";

/**
 * The demo pack at `docs/modules/invoices-and-payments/demo-pack/`. A test reads its expected
 * files and saves its history through the procedures a person uses, so the demo figures are
 * proven on the real path and no test restates a module formula.
 */
export const DEMO_PACK = new URL(
  "../../../../docs/modules/invoices-and-payments/demo-pack/",
  import.meta.url
);

// oxlint-disable-next-line anti-slop/no-unknown-returns -- the pack's files have different shapes, and each caller parses the one it reads.
export function readDemoJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, DEMO_PACK), "utf8"));
}

/**
 * A demo CSV as records. The header row names the columns, and no demo CSV holds a quoted comma,
 * so a plain split reads it. A blank cell stays an empty string, as the pack's blanks map to null.
 */
export function readDemoCsv(
  path: string
): readonly Readonly<Record<string, string>>[] {
  const [header = "", ...lines] = readFileSync(new URL(path, DEMO_PACK), "utf8")
    .trimEnd()
    // The pack's CSVs end their lines with a carriage return and a newline.
    .split(/\r?\n/);

  const names = header.split(",");

  return lines.map((line) => {
    const values = line.split(",");

    return Object.fromEntries(
      names.map((name, index) => [name, values[index] ?? ""])
    );
  });
}

/** Demo pack amounts are dollars with up to two decimals; the module holds integer cents. */
export function toCents(dollars: number): number {
  const cents = Math.round(dollars * 100);

  if (!Number.isSafeInteger(cents)) {
    throw new Error(
      `The demo amount ${dollars} is not a safe number of cents.`
    );
  }

  return cents;
}

/** The demo id of each saved record to its row id, so a test can join the pack's expected files. */
export type DemoHistoryIds = {
  readonly customers: ReadonlyMap<string, string>;
  readonly invoices: ReadonlyMap<string, string>;
  readonly payments: ReadonlyMap<string, string>;
};

type SeedCustomer = {
  readonly customer_id: string;
  readonly company_name: string;
  readonly email: string | null;
};

type SeedInvoice = {
  readonly invoice_id: string;
  readonly customer_id: string;
  readonly invoice_date: string;
  readonly due_date: string | null;
  readonly due_date_source: "document" | "user" | "unspecified";
  readonly payment_terms: string | null;
  readonly currency: string;
  readonly total_amount: number;
  readonly description: string | null;
};

type SeedPayment = {
  readonly payment_id: string;
  readonly customer_id: string;
  readonly payment_date: string;
  readonly currency: string;
  readonly amount: number;
  readonly payment_reference: string | null;
  readonly method: string | null;
};

type SeedAllocation = {
  readonly payment_id: string;
  readonly invoice_id: string;
  readonly allocated_amount: number;
};

type Seed = {
  readonly customers: readonly SeedCustomer[];
  readonly invoices: readonly SeedInvoice[];
  readonly payments: readonly SeedPayment[];
  readonly payment_allocations: readonly SeedAllocation[];
};

function byDate(left: string, right: string): number {
  return left.localeCompare(right);
}

function saved<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const value = map.get(key);

  if (value === undefined) {
    throw new Error(`The demo history saved no ${what} ${String(key)}.`);
  }

  return value;
}

/**
 * Saves `01_History_Datasets/history_seed.json` as a Finance person would: invoices in invoice
 * date order, then payments in payment date order with the pack's allocations as the chosen links.
 * Every save must answer `"saved"`; anything else means the pack and the rules disagree.
 */
export async function saveDemoHistory(
  ctx: ModuleRequestContext
): Promise<DemoHistoryIds> {
  // SAFETY: the pack's history file is read verbatim and this test loader owns its shape.
  const seed = readDemoJson("01_History_Datasets/history_seed.json") as Seed;
  const procedures = callProcedure(invoicesRouter, ctx);
  const customers = new Map<string, string>();
  const invoices = new Map<string, string>();
  const payments = new Map<string, string>();

  const seedCustomers = new Map(
    seed.customers.map((customer) => [customer.customer_id, customer])
  );

  const allocationsOf = new Map<string, SeedAllocation[]>();

  for (const allocation of seed.payment_allocations) {
    const list = allocationsOf.get(allocation.payment_id);

    if (list === undefined)
      allocationsOf.set(allocation.payment_id, [allocation]);
    else list.push(allocation);
  }

  for (const invoice of seed.invoices.toSorted((left, right) =>
    byDate(left.invoice_date, right.invoice_date)
  )) {
    const customer = saved(seedCustomers, invoice.customer_id, "customer");
    const existing = customers.get(invoice.customer_id);

    // The customer's first invoice creates it; every later one names the saved customer.
    const choice =
      existing === undefined
        ? {
            name: customer.company_name,
            email: customer.email,
            confirmed: true as const,
          }
        : { id: existing };

    // oxlint-disable-next-line no-await-in-loop -- the saves run in date order, one transaction each.
    const result = await procedures.saveInvoice({
      documentId: null,
      customer: choice,
      number: invoice.invoice_id,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      dueDateSource:
        invoice.due_date_source === "user" ? "person" : invoice.due_date_source,
      paymentTerms: invoice.payment_terms,
      currency: invoice.currency,
      totalCents: toCents(invoice.total_amount),
      description: invoice.description,
      // The pack repeats no number of a customer; a duplicated save would break the figures.
      keepPossibleDuplicate: false,
    });

    if (result.outcome !== "saved") {
      throw new Error(
        `The demo invoice ${invoice.invoice_id} answered ${result.outcome}.`
      );
    }

    customers.set(invoice.customer_id, result.customerId);
    invoices.set(invoice.invoice_id, result.invoiceId);
  }

  for (const payment of seed.payments.toSorted((left, right) =>
    byDate(left.payment_date, right.payment_date)
  )) {
    // oxlint-disable-next-line no-await-in-loop -- the saves run in date order, one transaction each.
    const result = await procedures.savePayment({
      documentId: null,
      customer: { id: saved(customers, payment.customer_id, "customer") },
      paymentDate: payment.payment_date,
      currency: payment.currency,
      amountCents: toCents(payment.amount),
      reference: payment.payment_reference,
      method: payment.method,
      // The pack holds no named numbers; its allocations are the links the person chose.
      namedInvoiceNumbers: [],
      allocations: (allocationsOf.get(payment.payment_id) ?? []).map(
        (allocation) => ({
          invoiceId: saved(invoices, allocation.invoice_id, "invoice"),
          amountCents: toCents(allocation.allocated_amount),
        })
      ),
      keepPossibleDuplicate: false,
    });

    if (result.outcome !== "saved") {
      throw new Error(
        `The demo payment ${payment.payment_id} answered ${result.outcome}.`
      );
    }

    payments.set(payment.payment_id, result.paymentId);
  }

  return { customers, invoices, payments };
}
