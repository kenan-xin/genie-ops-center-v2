/**
 * The client surface. A story, a component test and, later, the shell import from here, so none of
 * them pulls the router, the schema or their server dependencies into a browser.
 */

export { DocumentInbox, type DocumentInboxProps } from "./document-inbox.tsx";

export {
  DocumentStatusBadge,
  type DocumentStatusBadgeProps,
} from "./document-status-badge.tsx";

export { InvoiceList, type InvoiceListProps } from "./invoice-list.tsx";

export {
  InvoiceStatusBadge,
  type InvoiceStatusBadgeProps,
} from "./invoice-status-badge.tsx";

export {
  AllocationTable,
  type AllocationTableProps,
  HistoryTable,
  type HistoryTableProps,
  type LinkedRecord,
} from "./allocations.tsx";

export { InvoiceRecord, type InvoiceRecordProps } from "./invoice-record.tsx";

export { PaymentList, type PaymentListProps } from "./payment-list.tsx";

export {
  PaymentStatusBadge,
  type PaymentStatusBadgeProps,
} from "./payment-status-badge.tsx";

export { PaymentRecord, type PaymentRecordProps } from "./payment-record.tsx";

export {
  DocumentInboxPage,
  InvoiceListPage,
  InvoiceRecordPage,
  PaymentListPage,
  PaymentRecordPage,
} from "./module-pages.tsx";

export type {
  AllocationRow,
  DocumentInboxRow,
  DocumentInboxView,
  HistoryRow,
  InboxStatus,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceRecordView,
  InvoiceStatus,
  InvoiceListView,
  PaymentListRow,
  PaymentListView,
  PaymentRecordView,
  PaymentStatus,
} from "./views.ts";
