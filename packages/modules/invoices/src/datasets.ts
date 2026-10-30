import {
  type DatasetDeclaration,
  type DatasetField,
  scopesFor,
  type TenantContext,
} from "@genie/core";
import { and, eq, lte, sql } from "drizzle-orm";

import { RECORD_TYPES } from "./record-types.ts";
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

const text = (description: string): DatasetField => ({
  kind: "dimension",
  type: "text",
  description,
});

const date = (description: string): DatasetField => ({
  kind: "dimension",
  type: "date",
  description,
});

const flag = (description: string): DatasetField => ({
  kind: "dimension",
  type: "boolean",
  description,
});

const money = (description: string): DatasetField => ({
  kind: "measure",
  type: "money",
  description,
});

const count = (description: string): DatasetField => ({
  kind: "measure",
  type: "number",
  description,
});

const CURRENCY = text("The ISO currency code of the amounts on this row.");

export const invoicesDataset: DatasetDeclaration = {
  name: "invoices.invoices",
  description:
    "The saved invoices a person may read, dated on or before the reporting date, with the balance as of that date.",
  permission: "invoices:read",
  fields: {
    id: text("The invoice id."),
    invoiceNumber: text("The invoice number as printed on the invoice."),
    customerId: text("The id of the invoiced customer."),
    customerName: text("The name of the invoiced customer."),
    invoiceDate: date("The invoice date, by which invoiced sales are counted."),
    dueDate: date("The due date, null when the invoice states none."),
    dueDateSource: text(
      "Where the due date came from: document, person or unspecified."
    ),
    paymentTerms: text("The payment terms, null when blank."),
    description: text("The invoice description, null when blank."),
    currency: CURRENCY,
    totalCents: money(
      "The invoice total in cents, which summed by invoice date is invoiced sales."
    ),
    allocatedCents: money(
      "The cents of payments dated on or before the reporting date linked to this invoice."
    ),
    outstandingCents: money(
      "The total minus the allocated cents, which summed is outstanding; an unspecified due date stays in it."
    ),
    overdue: flag(
      "True when the invoice still has money outstanding and its known due date is before the reporting date. Due on the reporting date is not overdue."
    ),
    daysOverdue: count(
      "The days from the due date to the reporting date when overdue, else null."
    ),
    settledOn: date(
      "The date of the last linked payment when nothing is outstanding, else null."
    ),
    paidLate: flag(
      "True when a fully settled invoice with a known due date was settled after it; null when part-paid or with no due date, so such an invoice is not in a late-payment rate."
    ),
  },
  timeField: "invoiceDate",
  recordKey: { type: RECORD_TYPES.invoice, field: "id" },
  currencyField: "currency",
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
      })
      .from(invoice)
      .innerJoin(customer, eq(customer.id, invoice.customerId))
      .leftJoin(paid, eq(paid.invoiceId, invoice.id))
      .where(and(scope, lte(invoice.invoiceDate, asOf)));

    return { as: (alias: string) => select.as(alias) };
  },
};

export const paymentsDataset: DatasetDeclaration = {
  name: "invoices.payments",
  description:
    "The saved payments a person may read, dated on or before the reporting date, with the amount not yet linked to an invoice.",
  permission: "invoices:read",
  fields: {
    id: text("The payment id."),
    customerId: text("The id of the paying customer."),
    customerName: text("The name of the paying customer."),
    reference: text("The payment reference, null when none."),
    method: text("The payment method, null when none."),
    paymentDate: date("The payment date, by which collections are counted."),
    currency: CURRENCY,
    amountCents: money(
      "The payment amount in cents, which summed by payment date is collections."
    ),
    allocatedCents: money(
      "The cents of this payment linked to invoices dated on or before the reporting date."
    ),
    unallocatedCents: money(
      "The amount minus the allocated cents: money received that lowers no invoice balance."
    ),
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
  description:
    "Every customer a person may read, with its late-payment counts as of the reporting date. It holds no money, so no figure mixes currencies.",
  permission: "invoices:read",
  fields: {
    id: text("The customer id."),
    name: text("The customer name."),
    email: text("The customer email, null when none."),
    firstInvoiceDate: date(
      "The date of the customer's earliest invoice on or before the reporting date, null when none."
    ),
    settledWithDueDateCount: count(
      "The fully settled invoices with a known due date: the denominator of repeated late payment, which leaves out part-paid invoices."
    ),
    paidLateCount: count(
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
  description:
    "One row per link of a payment to an invoice, both dated on or before the reporting date, under the read scope of the invoice.",
  permission: "invoices:read",
  fields: {
    id: text("The allocation id."),
    invoiceId: text("The id of the linked invoice."),
    invoiceNumber: text("The number of the linked invoice."),
    paymentId: text("The id of the linked payment."),
    paymentReference: text(
      "The reference of the linked payment, null when none."
    ),
    customerId: text("The id of the customer of both records."),
    customerName: text("The name of the customer of both records."),
    paymentDate: date("The date of the linked payment."),
    currency: CURRENCY,
    amountCents: money("The cents of the payment applied to the invoice."),
    automatic: flag(
      "True when the link was made automatically and no person changed it."
    ),
  },
  timeField: "paymentDate",
  recordKey: { type: RECORD_TYPES.invoice, field: "invoiceId" },
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
