import type { DatasetCursor } from "@genie/core/rpc";

import type {
  DocumentInboxView,
  InvoiceListRow,
  InvoiceListSummary,
  PaymentListRow,
  PaymentListSummary,
} from "../contract.ts";

/**
 * What the invoice pages render. A loader fills it from `invoices.invoices` as of the reporting
 * date, and the page only formats what it answered (R-9, R-36).
 */
/** The Documents and record views are the contract's, so the page, its refetch and the loader share one shape. */
export type {
  AllocationRow,
  DocumentInboxRow,
  DocumentInboxView,
  DocumentReviewView,
  HistoryRow,
  InboxStatus,
  InvoiceDetail,
  InvoiceListFilters,
  InvoiceListParams,
  InvoiceListRow,
  InvoiceListSummary,
  InvoiceRecordView,
  InvoiceStatus,
  PaymentListFilters,
  PaymentListParams,
  PaymentListRow,
  PaymentListSummary,
  PaymentRecordView,
  PaymentStatus,
} from "../contract.ts";

/** The Documents inbox as the server rendered it and as the client pages it (czjw.49). */
export type DocumentInboxPageView = Omit<DocumentInboxView, "next"> & {
  readonly next: DatasetCursor | null;
};

export type InvoiceListView = {
  readonly asOf: string;
  readonly rows: readonly InvoiceListRow[];
  readonly truncated: boolean;
  /** Where the next page starts, when the list was cut (czjw.28). */
  readonly next: DatasetCursor | null;
  /** The rows of each tab under the other filters; page one only. */
  readonly counts: Readonly<Record<string, number>> | null;
  /** One entry per currency, over every invoice the filters and the tab keep; page one only. */
  readonly summary: readonly InvoiceListSummary[] | null;
};

/** A customer the list's customer picker offers. */
export type ListCustomer = { readonly id: string; readonly name: string };

/** The unfiltered first page the server renders, the customers of the picker, and the zone of Updated. */
export type InvoiceListPageView = InvoiceListView & {
  readonly customers: readonly ListCustomer[];
  readonly timeZone: string;
};

export type PaymentListView = {
  readonly asOf: string;
  readonly rows: readonly PaymentListRow[];
  readonly truncated: boolean;
  /** Where the next page starts, when the list was cut (czjw.28). */
  readonly next: DatasetCursor | null;
  /** The rows of each tab under the other filters; page one only. */
  readonly counts: Readonly<Record<string, number>> | null;
  /** One entry per currency, over every payment the filters and the tab keep; page one only. */
  readonly summary: readonly PaymentListSummary[] | null;
};

/** The unfiltered first page the server renders, the customers of the picker, and the zone of Updated. */
export type PaymentListPageView = PaymentListView & {
  readonly customers: readonly ListCustomer[];
  readonly timeZone: string;
};
