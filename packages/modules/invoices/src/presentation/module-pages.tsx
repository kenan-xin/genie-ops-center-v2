import type { ModulePageProps } from "@genie/core";

import { InvoiceList } from "./invoice-list.tsx";
import type { InvoiceListView } from "./views.ts";

/** The Invoices list, fed by `loadInvoiceList`. */
export function InvoiceListPage(props: ModulePageProps<InvoiceListView>) {
  return <InvoiceList view={props.data} />;
}
