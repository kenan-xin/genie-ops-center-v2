import type { ModulePageProps } from "@genie/core";

import { InvoiceList } from "./invoice-list.tsx";
import { InvoiceRecord } from "./invoice-record.tsx";
import { PaymentList } from "./payment-list.tsx";
import { PaymentRecord } from "./payment-record.tsx";
import type {
  InvoiceListView,
  InvoiceRecordView,
  PaymentListView,
  PaymentRecordView,
} from "./views.ts";

/** The Invoices list, fed by `loadInvoiceList`. */
export function InvoiceListPage(props: ModulePageProps<InvoiceListView>) {
  return <InvoiceList view={props.data} />;
}

/** One invoice, fed by `loadInvoiceRecord`. */
export function InvoiceRecordPage(props: ModulePageProps<InvoiceRecordView>) {
  return <InvoiceRecord view={props.data} />;
}

/** The Payments list, fed by `loadPaymentList`. */
export function PaymentListPage(props: ModulePageProps<PaymentListView>) {
  return <PaymentList view={props.data} />;
}

/** One payment, fed by `loadPaymentRecord`. */
export function PaymentRecordPage(props: ModulePageProps<PaymentRecordView>) {
  return <PaymentRecord view={props.data} />;
}
