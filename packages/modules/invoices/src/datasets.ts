import {
  type DatasetDeclaration,
  type DatasetField,
  scopesFor,
  type TenantContext,
} from "@genie/core";
import { and, eq, lte, sql } from "drizzle-orm";

import { INVOICE_DATASET_NAMES, RECORD_TYPES } from "./contract.ts";
import { allocation, customer, invoice, payment } from "./schema.ts";
import { customerScope, invoiceScope, paymentScope } from "./scope.ts";

/**
 * Per invoice, the allocations whose payment is dated on or before `asOf` (decision 11). The
 * invoices and customers datasets both read it, so every balance has one formula.
 */
function paidAsOf(db: TenantContext["db"], asOf: string) {
  return db
    .select({
      invoiceId: allocation.invoiceId,
      allocatedCents: sql<number>`sum(${allocation.amountCents})::int`.as(
        "allocatedCents"
      ),
      lastPaymentDate: sql<string>`max(${payment.paymentDate})`.as(
        "lastPaymentDate"
      ),
    })
    .from(allocation)
    .innerJoin(payment, eq(payment.id, allocation.paymentId))
    .where(lte(payment.paymentDate, asOf))
    .groupBy(allocation.invoiceId)
    .as("paid");
}

type Paid = ReturnType<typeof paidAsOf>;

/** The total minus its allocations as of the date: never stored (R-22). */
const outstandingOf = (paid: Paid) =>
  sql`(${invoice.totalCents} - coalesce(${paid.allocatedCents}, 0))`;

/** A settled invoice with a known due date, and whether its last payment came after it (R-36). */
const settledWithDueDate = (paid: Paid) =>
  sql`${outstandingOf(paid)} = 0 and ${invoice.dueDate} is not null`;

const paidLateOf = (paid: Paid) =>
  sql`${paid.lastPaymentDate} > ${invoice.dueDate}`;

// Each helper takes the label a person reads (D33) and the description the agent reads.
const text = (label: string, description: string): DatasetField => ({
  kind: "dimension",
  type: "text",
  label,
  description,
});

const date = (label: string, description: string): DatasetField => ({
  kind: "dimension",
  type: "date",
  label,
  description,
});

const flag = (label: string, description: string): DatasetField => ({
  kind: "dimension",
  type: "boolean",
  label,
  description,
});

const money = (label: string, description: string): DatasetField => ({
  kind: "measure",
  type: "money",
  label,
  description,
});

const count = (label: string, description: string): DatasetField => ({
  kind: "measure",
  type: "number",
  label,
  description,
});

const CURRENCY = text(
  "Currency",
  "The ISO currency code of the amounts on this row."
);

// The list fields stay hidden from the agent until the next recording refresh (LH1, DEC-55).
const UPDATED_AT: DatasetField = {
  kind: "dimension",
  type: "instant",
  label: "Updated",
  description: "When the row last changed.",
  hiddenFromAgent: true,
};

const listStatus = (description: string): DatasetField => ({
  ...text("Status", description),
  hiddenFromAgent: true,
});

export const invoicesDataset: DatasetDeclaration = {
  name: INVOICE_DATASET_NAMES.invoices,
  title: "Invoices",
  questions: ["Who owes us the most?", "Which invoices are overdue?"],
  description:
    "The saved invoices a person may read, dated on or before the reporting date, with the balance as of that date.",
  permission: "invoices:read",
  fields: {
    id: text("Invoice id", "The invoice id."),
    invoiceNumber: {
      ...text("Invoice", "The invoice number as printed on the invoice."),
      searchable: true,
    },
    customerId: text("Customer id", "The id of the invoiced customer."),
    customerName: {
      ...text("Customer", "The name of the invoiced customer."),
      searchable: true,
    },
    invoiceDate: date(
      "Invoice date",
      "The invoice date, by which invoiced sales are counted."
    ),
    dueDate: date(
      "Due date",
      "The due date, null when the invoice states none."
    ),
    dueDateSource: text(
      "Due date from",
      "Where the due date came from: document (read from the document), person (a person entered it by hand) or unspecified (marked as having none)."
    ),
    paymentTerms: text("Payment terms", "The payment terms, null when blank."),
    description: text(
      "Description",
      "The invoice description, null when blank."
    ),
    currency: CURRENCY,
    totalCents: money(
      "Total",
      "The invoice total in cents, which summed by invoice date is invoiced sales."
    ),
    allocatedCents: money(
      "Paid",
      "The cents of payments dated on or before the reporting date linked to this invoice. Above 0 while outstanding is above 0 means a partial payment."
    ),
    outstandingCents: money(
      "Outstanding",
      "The total minus the allocated cents, which summed is outstanding; an unspecified due date stays in it."
    ),
    overdue: flag(
      "Overdue",
      "True when the invoice still has money outstanding and its known due date is before the reporting date. Due on the reporting date is not overdue."
    ),
    daysOverdue: count(
      "Days overdue",
      "The days from the due date to the reporting date when overdue, else null."
    ),
    settledOn: date(
      "Settled on",
      "The date of the last linked payment when nothing is outstanding, else null."
    ),
    paidLate: flag(
      "Paid late",
      "True when a fully settled invoice with a known due date was settled after it; null when part-paid or with no due date, so such an invoice is not in a late-payment rate."
    ),
    updatedAt: UPDATED_AT,
    status: listStatus("paid, overdue, no-due-date or open."),
  },
  timeField: "invoiceDate",
  recordKey: { type: RECORD_TYPES.invoice, field: "id" },
  currencyField: "currency",
  summaryFields: ["invoiceNumber", "customerName", "outstandingCents"],
  source: async (ctx, asOf) => {
    const scope = invoiceScope(await scopesFor(ctx.caller, "invoices:read"));
    const paid = paidAsOf(ctx.tenant.db, asOf);
    const outstanding = outstandingOf(paid);
    // Strictly before: due on the reporting date is not overdue, and no due date never is (R-29).
    const overdue = sql`coalesce(${outstanding} > 0 and ${invoice.dueDate} < ${asOf}::date, false)`;

    const select = ctx.tenant.db
      .select({
        id: invoice.id,
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        customerName: customer.name,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        dueDateSource: invoice.dueDateSource,
        paymentTerms: sql`nullif(btrim(${invoice.paymentTerms}), '')`.as(
          "paymentTerms"
        ),
        description: sql`nullif(btrim(${invoice.description}), '')`.as(
          "description"
        ),
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        allocatedCents: sql`coalesce(${paid.allocatedCents}, 0)`.as(
          "allocatedCents"
        ),
        outstandingCents: sql`${outstanding}`.as("outstandingCents"),
        overdue: sql`${overdue}`.as("overdue"),
        daysOverdue:
          sql`case when ${overdue} then ${asOf}::date - ${invoice.dueDate} end`.as(
            "daysOverdue"
          ),
        settledOn:
          sql`case when ${outstanding} = 0 then ${paid.lastPaymentDate} end`.as(
            "settledOn"
          ),
        paidLate:
          sql`case when ${settledWithDueDate(paid)} then ${paidLateOf(paid)} end`.as(
            "paidLate"
          ),
        updatedAt: invoice.updatedAt,
        // The one rule that names a list status: the badge and the tab read it (LH16).
        status:
          sql`case when ${outstanding} <= 0 then 'paid' when ${overdue} then 'overdue' when ${invoice.dueDate} is null then 'no-due-date' else 'open' end`.as(
            "status"
          ),
      })
      .from(invoice)
      .innerJoin(customer, eq(customer.id, invoice.customerId))
      .leftJoin(paid, eq(paid.invoiceId, invoice.id))
      .where(and(scope, lte(invoice.invoiceDate, asOf)));

    return { as: (alias: string) => select.as(alias) };
  },
};

export const paymentsDataset: DatasetDeclaration = {
  name: INVOICE_DATASET_NAMES.payments,
  title: "Payments",
  questions: ["How much did we collect this month?"],
  description:
    "The saved payments a person may read, dated on or before the reporting date, with the amount not yet linked to an invoice.",
  permission: "invoices:read",
  fields: {
    id: text("Payment id", "The payment id."),
    customerId: text("Customer id", "The id of the paying customer."),
    customerName: {
      ...text("Customer", "The name of the paying customer."),
      searchable: true,
    },
    reference: {
      ...text("Reference", "The payment reference, null when none."),
      searchable: true,
    },
    method: text("Method", "The payment method, null when none."),
    paymentDate: date(
      "Payment date",
      "The payment date, by which collections are counted."
    ),
    currency: CURRENCY,
    amountCents: money(
      "Amount",
      "The payment amount in cents, which summed by payment date is collections."
    ),
    allocatedCents: money(
      "Linked",
      "The cents of this payment linked to invoices dated on or before the reporting date."
    ),
    unallocatedCents: money(
      "Unallocated",
      "The amount minus the allocated cents: money received that lowers no invoice balance."
    ),
    updatedAt: UPDATED_AT,
    status: listStatus("allocated, part-allocated or unallocated."),
  },
  timeField: "paymentDate",
  recordKey: { type: RECORD_TYPES.payment, field: "id" },
  currencyField: "currency",
  source: async (ctx, asOf) => {
    const scope = paymentScope(await scopesFor(ctx.caller, "invoices:read"));

    const links = ctx.tenant.db
      .select({
        paymentId: allocation.paymentId,
        allocatedCents: sql<number>`sum(${allocation.amountCents})::int`.as(
          "allocatedCents"
        ),
      })
      .from(allocation)
      // A link to an invoice dated after the reporting date is left out, as the other datasets do.
      .innerJoin(invoice, eq(invoice.id, allocation.invoiceId))
      .where(lte(invoice.invoiceDate, asOf))
      .groupBy(allocation.paymentId)
      .as("links");

    const allocated = sql`coalesce(${links.allocatedCents}, 0)`;

    const select = ctx.tenant.db
      .select({
        id: payment.id,
        customerId: payment.customerId,
        customerName: customer.name,
        reference: payment.reference,
        method: payment.method,
        paymentDate: payment.paymentDate,
        currency: payment.currency,
        amountCents: payment.amountCents,
        allocatedCents: sql`${allocated}`.as("allocatedCents"),
        unallocatedCents: sql`${payment.amountCents} - ${allocated}`.as(
          "unallocatedCents"
        ),
        updatedAt: payment.updatedAt,
        // R-31 in one rule: the badge and the tab read it (LH16).
        status:
          sql`case when ${allocated} = 0 then 'unallocated' when ${allocated} = ${payment.amountCents} then 'allocated' else 'part-allocated' end`.as(
            "status"
          ),
      })
      .from(payment)
      .innerJoin(customer, eq(customer.id, payment.customerId))
      .leftJoin(links, eq(links.paymentId, payment.id))
      .where(and(scope, lte(payment.paymentDate, asOf)));

    return { as: (alias: string) => select.as(alias) };
  },
};

export const customersDataset: DatasetDeclaration = {
  name: "invoices.customers",
  title: "Customers",
  description:
    "Every customer a person may read, with its late-payment counts as of the reporting date. It holds no money, so no figure mixes currencies.",
  permission: "invoices:read",
  fields: {
    id: text("Customer id", "The customer id."),
    name: text("Customer", "The customer name."),
    email: text("Email", "The customer email, null when none."),
    firstInvoiceDate: date(
      "First invoice",
      "The date of the customer's earliest invoice on or before the reporting date, null when none."
    ),
    settledWithDueDateCount: count(
      "Settled with a due date",
      "The fully settled invoices with a known due date: the denominator of repeated late payment, which leaves out part-paid invoices."
    ),
    paidLateCount: count(
      "Paid late",
      "Of the settled invoices with a known due date, those whose last payment came after the due date."
    ),
  },
  timeField: "firstInvoiceDate",
  recordKey: { type: RECORD_TYPES.customer, field: "id" },
  source: async (ctx, asOf) => {
    const scope = customerScope(await scopesFor(ctx.caller, "invoices:read"));
    const paid = paidAsOf(ctx.tenant.db, asOf);
    const settled = settledWithDueDate(paid);

    const stats = ctx.tenant.db
      .select({
        customerId: invoice.customerId,
        firstInvoiceDate: sql<string>`min(${invoice.invoiceDate})`.as(
          "firstInvoiceDate"
        ),
        settledWithDueDateCount:
          sql<number>`(count(*) filter (where ${settled}))::int`.as(
            "settledWithDueDateCount"
          ),
        paidLateCount:
          sql<number>`(count(*) filter (where ${settled} and ${paidLateOf(paid)}))::int`.as(
            "paidLateCount"
          ),
      })
      .from(invoice)
      .leftJoin(paid, eq(paid.invoiceId, invoice.id))
      .where(lte(invoice.invoiceDate, asOf))
      .groupBy(invoice.customerId)
      .as("stats");

    // Every customer is listed, also one with no invoice yet (decision 11).
    const select = ctx.tenant.db
      .select({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        firstInvoiceDate: sql`${stats.firstInvoiceDate}`.as("firstInvoiceDate"),
        settledWithDueDateCount:
          sql`coalesce(${stats.settledWithDueDateCount}, 0)`.as(
            "settledWithDueDateCount"
          ),
        paidLateCount: sql`coalesce(${stats.paidLateCount}, 0)`.as(
          "paidLateCount"
        ),
      })
      .from(customer)
      .leftJoin(stats, eq(stats.customerId, customer.id))
      .where(scope);

    return { as: (alias: string) => select.as(alias) };
  },
};

export const allocationsDataset: DatasetDeclaration = {
  name: "invoices.allocations",
  title: "Payment links",
  description:
    "One row per link of a payment to an invoice, both dated on or before the reporting date, under the read scope of the invoice.",
  permission: "invoices:read",
  fields: {
    id: text("Link id", "The allocation id."),
    invoiceId: text("Invoice id", "The id of the linked invoice."),
    invoiceNumber: text("Invoice", "The number of the linked invoice."),
    paymentId: text("Payment id", "The id of the linked payment."),
    paymentReference: text(
      "Payment reference",
      "The reference of the linked payment, null when none."
    ),
    customerId: text("Customer id", "The id of the customer of both records."),
    customerName: text("Customer", "The name of the customer of both records."),
    paymentDate: date("Payment date", "The date of the linked payment."),
    currency: CURRENCY,
    amountCents: money(
      "Amount",
      "The cents of the payment applied to the invoice."
    ),
    automatic: flag(
      "Linked automatically",
      "True when the link was made automatically and no person changed it."
    ),
  },
  timeField: "paymentDate",
  recordKey: { type: RECORD_TYPES.invoice, field: "invoiceId" },
  // Several links share one invoice, so a page edge needs each link's own id (czjw.48).
  rowKeyField: "id",
  currencyField: "currency",
  source: async (ctx, asOf) => {
    const scope = invoiceScope(await scopesFor(ctx.caller, "invoices:read"));

    const select = ctx.tenant.db
      .select({
        id: allocation.id,
        invoiceId: allocation.invoiceId,
        invoiceNumber: invoice.number,
        paymentId: allocation.paymentId,
        paymentReference: payment.reference,
        customerId: invoice.customerId,
        customerName: customer.name,
        paymentDate: payment.paymentDate,
        currency: invoice.currency,
        amountCents: allocation.amountCents,
        automatic: allocation.automatic,
      })
      .from(allocation)
      .innerJoin(invoice, eq(invoice.id, allocation.invoiceId))
      .innerJoin(payment, eq(payment.id, allocation.paymentId))
      .innerJoin(customer, eq(customer.id, invoice.customerId))
      .where(
        and(
          scope,
          lte(payment.paymentDate, asOf),
          lte(invoice.invoiceDate, asOf)
        )
      );

    return { as: (alias: string) => select.as(alias) };
  },
};
