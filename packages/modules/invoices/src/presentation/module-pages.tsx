import type { ModulePageProps } from "@genie/core";

import { DocumentInbox } from "./document-inbox.tsx";
import { DocumentReview } from "./document-review.tsx";
import { InvoiceList } from "./invoice-list.tsx";
import { InvoiceRecord } from "./invoice-record.tsx";
import { PaymentList } from "./payment-list.tsx";
import { PaymentRecord } from "./payment-record.tsx";
import type {
  DocumentInboxView,
  DocumentReviewView,
  InvoiceListPageView,
  InvoiceRecordView,
  PaymentListView,
  PaymentRecordView,
} from "./views.ts";

/** The Documents inbox, fed by `loadDocumentInbox`. */
export function DocumentInboxPage(props: ModulePageProps<DocumentInboxView>) {
  return <DocumentInbox view={props.data} />;
}

/** One document's review, fed by `loadDocumentReview`. */
export function DocumentReviewPage(props: ModulePageProps<DocumentReviewView>) {
  return <DocumentReview view={props.data} />;
}

/** The Invoices list, fed by `loadInvoiceList`. */
export function InvoiceListPage(props: ModulePageProps<InvoiceListPageView>) {
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
