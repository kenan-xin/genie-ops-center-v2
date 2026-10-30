import type { ModulePageProps } from "@genie/core";

import { InvoiceList } from "./invoice-list.tsx";
import { InvoiceRecord } from "./invoice-record.tsx";
import type { InvoiceListView, InvoiceRecordView } from "./views.ts";

/** The Invoices list, fed by `loadInvoiceList`. */
export function InvoiceListPage(props: ModulePageProps<InvoiceListView>) {
  return <InvoiceList view={props.data} />;
}

/** One invoice, fed by `loadInvoiceRecord`. */
export function InvoiceRecordPage(props: ModulePageProps<InvoiceRecordView>) {
  return <InvoiceRecord view={props.data} />;
}
