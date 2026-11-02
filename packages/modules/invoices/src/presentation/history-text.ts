import { formatDay, formatMoney } from "./format.ts";
import type { AllocationRow, HistoryRow } from "./views.ts";

/** Which record of a link a row opens: the payment on an invoice's page, the invoice on a payment's. */
export type LinkedRecord = "payment" | "invoice";

/** How a link names its other record: a payment by reference, else by day; an invoice by number. */
export function labelOf(
  row: Omit<AllocationRow, "id" | "amountCents">,
  other: LinkedRecord
): string {
  return other === "payment"
    ? (row.paymentReference ?? formatDay(row.paymentDate))
    : row.invoiceNumber;
}

const NOUN: Record<LinkedRecord, string> = {
  payment: "Payment",
  invoice: "Invoice",
};

/**
 * One change of a link as a sentence (finding 2.5). It uses only the stored link amounts: no
 * outstanding before and after, because a corrected total would make a running sum wrong.
 */
export function historySentence(row: HistoryRow, other: LinkedRecord): string {
  const label = labelOf(row, other);
  const name = `${NOUN[other]} ${label}`;
  const before = formatMoney(row.amountBeforeCents, row.currency);
  const after = formatMoney(row.amountAfterCents, row.currency);

  if (row.action === "linked") {
    const how = row.automatic ? "automatically" : "by a person";

    return `${name} linked ${how} for ${after}.`;
  }

  if (row.action === "changed") {
    return `Link to ${other} ${label} changed from ${before} to ${after}.`;
  }

  return `${name} unlinked. ${before} returns to the payment as unallocated.`;
}
