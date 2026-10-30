/**
 * What the invoice pages render. A loader fills it from `invoices.invoices` as of the reporting
 * date, and the page only formats what it answered (R-9, R-36).
 */

export type InvoiceStatus =
  | { readonly kind: "paid" | "open" | "no-due-date" }
  | { readonly kind: "overdue"; readonly daysOverdue: number };

export type InvoiceListRow = {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly customerName: string;
  readonly invoiceDate: string;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly totalCents: number;
  readonly outstandingCents: number;
  readonly status: InvoiceStatus;
};

export type InvoiceListView = {
  readonly asOf: string;
  readonly rows: readonly InvoiceListRow[];
  readonly truncated: boolean;
};

/** One link of a payment to an invoice, as `invoices.allocations` answers it. */
export type AllocationRow = {
  readonly id: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly paymentId: string;
  readonly paymentReference: string | null;
  readonly paymentDate: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly automatic: boolean;
};

/** One change of a link, oldest first. An unlinked link keeps its events. */
export type HistoryRow = Omit<AllocationRow, "id" | "amountCents"> & {
  readonly id: string;
  readonly action: "linked" | "changed" | "unlinked";
  readonly occurredAt: string;
  readonly amountBeforeCents: number;
  readonly amountAfterCents: number;
};

export type InvoiceDetail = InvoiceListRow & {
  readonly dueDateSource: "document" | "person" | "unspecified";
  readonly paymentTerms: string | null;
  readonly description: string | null;
  readonly allocatedCents: number;
};

/** A record dated after the reporting date is in no balance yet, so it shows a note (P7). */
export type InvoiceRecordView =
  | {
      readonly kind: "shown";
      readonly asOf: string;
      readonly timeZone: string;
      readonly invoice: InvoiceDetail;
      readonly allocations: readonly AllocationRow[];
      readonly history: readonly HistoryRow[];
      readonly documentUrl: string | null;
    }
  | {
      readonly kind: "after-reporting-date";
      readonly asOf: string;
      readonly label: string;
    };
