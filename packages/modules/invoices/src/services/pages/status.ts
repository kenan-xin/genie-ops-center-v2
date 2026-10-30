import type { InvoiceStatus, PaymentStatus } from "../../presentation/views.ts";

/**
 * The status of one invoice at the reporting date, from the row the dataset answered. The dataset
 * already applies R-29 and R-36 to `overdue`, so this only names the four states the pages show.
 */
export function invoiceStatusOf(row: {
  readonly outstandingCents: number;
  readonly overdue: boolean;
  readonly daysOverdue: number | null;
  readonly dueDate: string | null;
}): InvoiceStatus {
  if (row.outstandingCents <= 0) return { kind: "paid" };

  if (row.overdue && row.daysOverdue !== null) {
    return { kind: "overdue", daysOverdue: row.daysOverdue };
  }

  return row.dueDate === null ? { kind: "no-due-date" } : { kind: "open" };
}

/**
 * The status of one payment, in the words of R-31, from the row the dataset answered. Money not yet
 * linked is what separates Allocated from Part allocated and Unallocated.
 */
export function paymentStatusOf(row: {
  readonly amountCents: number;
  readonly unallocatedCents: number;
}): PaymentStatus {
  if (row.unallocatedCents === 0) return "allocated";

  return row.unallocatedCents === row.amountCents
    ? "unallocated"
    : "part-allocated";
}
