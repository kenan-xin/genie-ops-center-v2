import {
  AppError,
  CORE_ERRORS,
  type ModuleRequestContext,
  scopesFor,
} from "@genie/core";
import { and, eq, or } from "drizzle-orm";

import type { DocumentReviewView, StoredReading } from "../../contract.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import {
  allocation,
  customer,
  invoice,
  payment,
  sourceDocument,
} from "../../schema.ts";
import { assertCanReadEverywhere } from "../ledger/access.ts";
import { findCustomerByName } from "../ledger/customers.ts";
import { factsChecked } from "../ledger/documents.ts";
import { readOpenInvoices } from "../ledger/open-invoices.ts";
import { findPossibleDuplicatePayment } from "../ledger/payments.ts";
import {
  decidePaymentMatch,
  normalizedInvoiceNumbers,
} from "../matching/decide.ts";
import { centsOf } from "../reading/quote-check.ts";
import { documentState, reasonOf } from "./inbox.ts";

/** The customer choices of the review (czjw.28). */
const CUSTOMER_CAP = 1000;

type Customer = { readonly id: string; readonly name: string };

/**
 * The payment section of an unsaved payment document: the matched customer's open invoices in
 * the reading's currency, the R-30 proposal over them, and a Possible duplicate (decision 5). It
 * reads and stores nothing else, so the save checks the same amounts again under its locks.
 */
async function paymentReview(
  ctx: ModuleRequestContext,
  documentId: string,
  reading: StoredReading | null,
  match: Customer | null
): Promise<NonNullable<DocumentReviewView["payment"]>> {
  const currency = reading?.fields.currency?.value;
  const amount = reading?.fields.amount?.value;
  const amountCents = amount === undefined ? undefined : centsOf(amount);
  const paymentDate = reading?.fields.date?.value;

  const openInvoices =
    match === null || currency === undefined
      ? []
      : (await readOpenInvoices(ctx.tenant.db, match.id, currency)).rows;

  const proposal =
    currency === undefined || amountCents === undefined
      ? ({ kind: "no-match" } as const)
      : decidePaymentMatch(
          {
            customerId: match?.id ?? null,
            currency,
            amountCents,
            namedInvoiceNumbers: normalizedInvoiceNumbers(
              (reading?.invoiceNumbers ?? []).map(({ value }) => value)
            ),
            factsChecked: await factsChecked(ctx.tenant.db, documentId),
          },
          openInvoices
        );

  const possibleDuplicateOf =
    match === null ||
    paymentDate === undefined ||
    currency === undefined ||
    amountCents === undefined
      ? undefined
      : await findPossibleDuplicatePayment(ctx.tenant.db, match.id, {
          paymentDate,
          currency,
          amountCents,
        });

  return {
    openInvoices,
    proposal,
    possibleDuplicateOf: possibleDuplicateOf ?? null,
  };
}

/** Every `automatic` link of the payment or the invoice saved from the document. */
async function automaticLinksOf(ctx: ModuleRequestContext, documentId: string) {
  return ctx.tenant.db
    .select({
      allocationId: allocation.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      paymentId: payment.id,
      paymentReference: payment.reference,
      paymentDate: payment.paymentDate,
      currency: payment.currency,
      amountCents: allocation.amountCents,
    })
    .from(allocation)
    .innerJoin(invoice, eq(invoice.id, allocation.invoiceId))
    .innerJoin(payment, eq(payment.id, allocation.paymentId))
    .where(
      and(
        eq(allocation.automatic, true),
        or(
          eq(payment.documentId, documentId),
          eq(invoice.documentId, documentId)
        )
      )
    )
    .orderBy(invoice.number, allocation.id);
}

/**
 * One document for its review (R-30, R-38): its state as the inbox decides it, a link to its own
 * bytes, its reading, the customer it names, and either the payment proposal or the records
 * saved from it. A document has no customer before a save, so the review needs a tenant-wide
 * `invoices:read` (DEC-39, decision 3).
 *
 * shortcut: at most 1,000 customer choices; page or search past it with czjw.28
 */
export async function loadDocumentReview(
  ctx: ModuleRequestContext,
  id: string
): Promise<DocumentReviewView> {
  await assertCanReadEverywhere(ctx.caller);

  const [document] = await ctx.tenant.db
    .select({
      ...documentState,
      fileId: sourceDocument.fileId,
      reading: sourceDocument.reading,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      paymentId: payment.id,
      paymentReference: payment.reference,
      paymentDate: payment.paymentDate,
    })
    .from(sourceDocument)
    .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
    .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
    .where(eq(sourceDocument.id, id));

  if (document === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const customerName = document.reading?.fields.customer?.value;

  const [link, writeScope, customers, found] = await Promise.all([
    ctx.tenant.fileStorage.createLink({
      fileId: document.fileId,
      principal: ctx.caller,
      permission: "invoices:read",
      resource: { type: RECORD_TYPES.document, id },
    }),
    scopesFor(ctx.caller, "invoices:write"),
    ctx.tenant.db
      .select({ id: customer.id, name: customer.name })
      .from(customer)
      .orderBy(customer.name, customer.id)
      .limit(CUSTOMER_CAP),
    customerName === undefined
      ? undefined
      : findCustomerByName(ctx.tenant.db, customerName),
  ]);

  const customerMatch = found ?? null;

  const savedInvoice =
    document.invoiceId === null || document.invoiceNumber === null
      ? null
      : { id: document.invoiceId, number: document.invoiceNumber };

  const savedPayment =
    document.paymentId === null || document.paymentDate === null
      ? null
      : {
          id: document.paymentId,
          reference: document.paymentReference,
          paymentDate: document.paymentDate,
        };

  const hasRecord = savedInvoice !== null || savedPayment !== null;

  return {
    document: {
      id,
      label: document.label,
      kind: document.kind,
      status: document.status,
      reason: reasonOf(document.readingOutcome),
      fileUrl: link.url,
    },
    reading: document.reading,
    canWrite: writeScope.kind === "all",
    customers,
    customerMatch,
    payment:
      document.kind === "payment" && !hasRecord
        ? await paymentReview(ctx, id, document.reading, customerMatch)
        : null,
    saved: hasRecord
      ? {
          invoice: savedInvoice,
          payment: savedPayment,
          automaticLinks: await automaticLinksOf(ctx, id),
        }
      : null,
  };
}
