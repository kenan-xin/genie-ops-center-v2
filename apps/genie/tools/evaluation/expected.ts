import {
  readDemoCsv,
  readDemoJson,
  toCents,
} from "@genie/module-invoices/testing";
import { z } from "zod";

/**
 * What each live upload must read as (plan D2). Only the scorer reads this: the expected entities
 * never enter a prompt, a message or a recording. A field left out is not scored.
 */
export type ExpectedReading = {
  readonly kind: "invoice" | "payment" | "paid-receipt" | "purchase-order";
  readonly customer?: string;
  readonly number?: string;
  readonly date?: string;
  readonly dueDate?: string | null;
  readonly paymentTerms?: string | null;
  readonly currency?: string;
  readonly amountCents?: number;
  readonly reference?: string;
  readonly method?: string;
  readonly description?: string;
  readonly invoiceNumbers?: readonly string[] | undefined;
};

const payment = z.object({
  payment_id: z.string(),
  customer_id: z.string(),
  payment_date: z.string(),
  currency: z.string(),
  amount: z.number(),
  payment_reference: z.string(),
  method: z.string(),
  source_pdf: z.string(),
});

const entities = z.object({
  new_invoice: z.object({
    invoice_id: z.string(),
    customer_id: z.string(),
    invoice_date: z.string(),
    document_due_date: z.string().nullable(),
    payment_terms: z.string().nullable(),
    currency: z.string(),
    total_amount: z.number(),
    description: z.string(),
  }),
  new_payments: z.array(payment),
  new_allocations: z.array(
    z.object({ payment_id: z.string(), invoice_id: z.string() })
  ),
  paid_receipt: z.object({
    customer_id: z.string(),
    date: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
});

function load() {
  const live = entities.parse(
    readDemoJson("04_Demo_Guide/live_expected_entities_DO_NOT_PRELOAD.json")
  );

  const names = new Map(
    readDemoCsv("01_History_Datasets/customers.csv").map((row) => [
      row["customer_id"],
      row["company_name"],
    ])
  );

  const customer = (id: string) => {
    const name = names.get(id);

    if (name === undefined) throw new Error(`No demo customer ${id}.`);

    return name;
  };

  const paymentOf = (file: string): ExpectedReading => {
    const found = live.new_payments.find((item) =>
      item.source_pdf.endsWith(file)
    );

    if (found === undefined) throw new Error(`No live payment from ${file}.`);

    const invoices = live.new_allocations
      .filter((item) => item.payment_id === found.payment_id)
      .map((item) => item.invoice_id);

    return {
      kind: "payment",
      customer: customer(found.customer_id),
      date: found.payment_date,
      currency: found.currency,
      amountCents: toCents(found.amount),
      reference: found.payment_reference,
      method: found.method,
      // An unmatched payment has no allocation, so the numbers it names are not scored.
      invoiceNumbers: invoices.length > 0 ? invoices : undefined,
    };
  };

  const invoice = live.new_invoice;
  const receipt = live.paid_receipt;
  const twoPayment = paymentOf("02_Payment_Partial_Existing_Invoice.pdf");

  return new Map<string, ExpectedReading>([
    [
      "01",
      {
        kind: "invoice",
        customer: customer(invoice.customer_id),
        number: invoice.invoice_id,
        date: invoice.invoice_date,
        dueDate: invoice.document_due_date,
        paymentTerms: invoice.payment_terms,
        currency: invoice.currency,
        amountCents: toCents(invoice.total_amount),
        description: invoice.description,
      },
    ],
    ["02", twoPayment],
    ["03", paymentOf("03_Payment_Covers_Two_Invoices.pdf")],
    // The manifest names document 04 a byte-for-byte duplicate of document 02.
    ["04", twoPayment],
    ["05", paymentOf("05_Payment_Unmatched.pdf")],
    [
      "06",
      {
        kind: "paid-receipt",
        customer: customer(receipt.customer_id),
        date: receipt.date,
        currency: receipt.currency,
        amountCents: toCents(receipt.amount),
      },
    ],
    ["07", { kind: "purchase-order" }],
  ]);
}

let expected: Map<string, ExpectedReading> | undefined;

/** The expectation of one live upload, by its case id (`01` to `07`). */
export function expectedReadingOf(caseId: string): ExpectedReading {
  expected ??= load();

  const found = expected.get(caseId);

  if (found === undefined) throw new Error(`No expected reading ${caseId}.`);

  return found;
}
