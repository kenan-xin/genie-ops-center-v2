/**
 * The client surface. A story, a component test and, later, the shell import from here, so none of
 * them pulls the router, the schema or their server dependencies into a browser.
 */

export { InvoiceList, type InvoiceListProps } from "./invoice-list.tsx";

export {
  InvoiceStatusBadge,
  type InvoiceStatusBadgeProps,
} from "./invoice-status-badge.tsx";

export { InvoiceListPage } from "./module-pages.tsx";

export type {
  InvoiceListRow,
  InvoiceStatus,
  InvoiceListView,
} from "./views.ts";
