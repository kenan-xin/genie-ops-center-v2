/**
 * What the invoice pages render. A loader fills it from `invoices.invoices` as of the reporting
 * date, and the page only formats what it answered (R-9, R-36).
 */

import type { InvoiceListRow, PaymentListRow } from "../contract.ts";

/** The Documents and record views are the contract's, so the page, its refetch and the loader share one shape. */
export type {
  AllocationRow,
  DocumentInboxRow,
  DocumentInboxView,
  DocumentReviewView,
  HistoryRow,
  InboxStatus,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceRecordView,
  InvoiceStatus,
  PaymentListRow,
  PaymentRecordView,
  PaymentStatus,
} from "../contract.ts";

export type InvoiceListView = {
  readonly asOf: string;
  readonly rows: readonly InvoiceListRow[];
  readonly truncated: boolean;
};

export type PaymentListView = {
  readonly asOf: string;
  readonly rows: readonly PaymentListRow[];
  readonly truncated: boolean;
};
