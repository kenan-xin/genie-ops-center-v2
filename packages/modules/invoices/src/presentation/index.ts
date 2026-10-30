/**
 * The client surface. A story, a component test and, later, the shell import from here, so none of
 * them pulls the router, the schema or their server dependencies into a browser.
 */

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

export { InvoiceListPage, InvoiceRecordPage } from "./module-pages.tsx";

export type {
  AllocationRow,
  HistoryRow,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceRecordView,
  InvoiceStatus,
  InvoiceListView,
} from "./views.ts";
