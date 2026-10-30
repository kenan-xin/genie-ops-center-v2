/**
 * What the invoice pages render. A loader fills it from `invoices.invoices` as of the reporting
 * date, and the page only formats what it answered (R-9, R-36).
 */

/** The Documents inbox view is the contract's, so the page and the loader share one shape. */
export type {
  DocumentInboxRow,
  DocumentInboxView,
  InboxStatus,
} from "../contract.ts";

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

/** One payment's three states, in the words of R-31. */
export type PaymentStatus = "allocated" | "part-allocated" | "unallocated";

/** One payment as the list shows it, its unallocated money read into its status. */
export type PaymentListRow = {
  readonly id: string;
  readonly reference: string | null;
  readonly customerName: string;
  readonly paymentDate: string;
  readonly method: string | null;
  readonly currency: string;
  readonly amountCents: number;
  readonly unallocatedCents: number;
  readonly status: PaymentStatus;
};

export type PaymentListView = {
  readonly asOf: string;
  readonly rows: readonly PaymentListRow[];
  readonly truncated: boolean;
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

/** What the payment record page renders, its links read as of the reporting date (R-9, R-36). */
export type PaymentRecordView =
  | {
      readonly kind: "shown";
      readonly asOf: string;
      readonly timeZone: string;
      readonly payment: PaymentListRow & { readonly allocatedCents: number };
      readonly allocations: readonly AllocationRow[];
      readonly history: readonly HistoryRow[];
      readonly documentUrl: string | null;
    }
  | {
      readonly kind: "after-reporting-date";
      readonly asOf: string;
      readonly label: string;
    };
