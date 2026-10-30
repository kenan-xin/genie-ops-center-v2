/**
 * What the Invoices list renders. A loader fills it from `invoices.invoices` as of the reporting
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
