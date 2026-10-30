import { AppError, CORE_ERRORS, type ModuleRequestContext } from "@genie/core";

import { INVOICE_ERRORS } from "../../errors.ts";
import type { ReadingOutcome } from "../../schema.ts";
import {
  type ReadingPaymentInput,
  type ReadingPaymentOutcome,
  recordPaymentFromReading,
} from "../ledger/payments.ts";
import { centsOf } from "./quote-check.ts";
import type { StoredReading } from "./stored-reading.ts";

/**
 * The payment a reading states, or undefined when a field the save needs did not pass the quote
 * check. The draft is the stored reading itself, so no dataset counts it (S7-06 decision 3).
 */
export function paymentDraftOf(
  documentId: string,
  reading: StoredReading
): ReadingPaymentInput | undefined {
  const { customer, date, currency, amount, reference, method } =
    reading.fields;

  if (!customer || !date || !currency || !amount) return undefined;

  const amountCents = centsOf(amount.value);

  // The quote check keeps only an amount that centsOf parses; a stored reading is still data.
  if (amountCents === undefined) return undefined;

  return {
    documentId,
    customerName: customer.value,
    paymentDate: date.value,
    currency: currency.value,
    amountCents,
    reference: reference?.value ?? null,
    method: method?.value ?? null,
    namedInvoiceNumbers: reading.invoiceNumbers.map((number) => number.value),
  };
}

/**
 * The outcome a reading stores from the save's answer. A saved payment stores none, because the
 * records decide the inbox status (decision 11); a match the person settles stores none either.
 */
export function paymentOutcomeOf(
  answer: ReadingPaymentOutcome
): ReadingOutcome | null {
  switch (answer.outcome) {
    case "saved":
    case "already-saved":
      return null;
    case "possible-duplicate":
      return "possible-duplicate";
    case "needs-review":
      if (answer.match.kind === "split") return "confirm-split";

      if (answer.match.kind === "no-match") return "no-match";

      return null;
  }
}

const SETTLING_CODES = new Set([
  // The uploader lost invoices:write before the run (decision 2).
  CORE_ERRORS.forbidden.code,
  // A person saved the document by hand first (S7-06 bead note T5-c).
  INVOICE_ERRORS["document-already-saved"].code,
  // A person changed the document's type.
  INVOICE_ERRORS["document-kind-mismatch"].code,
]);

/** Whether a refused save ends the reading as read: a retry would be refused the same way. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught error, which is unknown by nature.
export function settlesReading(error: unknown): boolean {
  return error instanceof AppError && SETTLING_CODES.has(error.code);
}

/**
 * Saves the payment a reading states as the job's caller, the uploader (R-12), and answers the
 * outcome to store. Only `recordPaymentFromReading` decides a link (R-30). An error that a retry
 * cannot change answers no outcome; any other error fails the attempt.
 */
export async function matchPaymentReading(
  ctx: ModuleRequestContext,
  documentId: string,
  reading: StoredReading
): Promise<ReadingOutcome | null> {
  const draft = paymentDraftOf(documentId, reading);

  if (draft === undefined) return null;

  try {
    return paymentOutcomeOf(await recordPaymentFromReading(ctx, draft));
  } catch (error) {
    if (settlesReading(error)) return null;

    throw error;
  }
}
