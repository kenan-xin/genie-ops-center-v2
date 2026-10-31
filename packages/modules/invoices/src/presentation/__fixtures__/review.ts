/**
 * Deterministic English fixtures for the document review stories.
 *
 * The values and quotes come from the S7-08 readings of the live demo files. They are not seed
 * data and they never reach a runtime path.
 */
import type { DocumentReviewView } from "../views.ts";

const ABC_TRADING = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "ABC Trading",
};

const MERIDIAN_LABS = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "MERIDIAN LABS",
};

/** Live upload 01: the invoice with no due date (read-01). */
export const invoiceReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000101",
    label: "01_Invoice_Missing_Due_Date.pdf",
    kind: "invoice",
    status: "needs-input",
    reason: null,
    fileUrl: "/demo-pack/01_Invoice_Missing_Due_Date.pdf",
  },
  reading: {
    fields: {
      customer: {
        value: "ABC Trading",
        quote: "Bill to: ABC Trading",
        page: 1,
      },
      number: {
        value: "INV-LIVE-001",
        quote: "Invoice number INV-LIVE-001",
        page: 1,
      },
      date: { value: "2026-10-26", quote: "Invoice date 2026-10-26", page: 1 },
      currency: { value: "SGD", quote: "Currency: SGD", page: 1 },
      amount: { value: "5000.00", quote: "TOTAL (SGD) 5,000.00", page: 1 },
      description: {
        value: "Additional consulting project - October 2026",
        quote: "Additional consulting project - October 2026",
        page: 1,
      },
    },
    invoiceNumbers: [],
    // A value that failed the quote check, to show the "Check this" tag.
    dropped: ["dueDate"],
  },
  canWrite: true,
  customers: [ABC_TRADING],
  customerMatch: ABC_TRADING,
  payment: null,
  saved: null,
};

/** Upload 01 while its reading job still runs. */
export const readingReview: DocumentReviewView = {
  document: {
    id: invoiceReview.document.id,
    label: invoiceReview.document.label,
    kind: null,
    status: "reading",
    reason: null,
    fileUrl: "/demo-pack/01_Invoice_Missing_Due_Date.pdf?v=1",
  },
  reading: null,
  canWrite: true,
  customers: [],
  customerMatch: null,
  payment: null,
  saved: null,
};

/** Upload 01, whose reading could not finish. */
export const couldNotReadReview: DocumentReviewView = {
  ...readingReview,
  document: {
    ...readingReview.document,
    status: "could-not-read",
    fileUrl: "/demo-pack/01_Invoice_Missing_Due_Date.pdf",
  },
};

/** Live upload 07: the purchase order that changes no figure (read-07). */
export const purchaseOrderReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000107",
    label: "07_Purchase_Order_Not_Proof_of_Payment.pdf",
    kind: "purchase-order",
    status: "kept-as-reference",
    reason: null,
    fileUrl: "/demo-pack/07_Purchase_Order_Not_Proof_of_Payment.pdf",
  },
  reading: {
    fields: {
      customer: { value: "MERIDIAN LABS", quote: "MERIDIAN LABS", page: 1 },
      number: {
        value: "PO-LIVE-001",
        quote: "Purchase order number PO-LIVE-001",
        page: 1,
      },
      date: { value: "2026-10-27", quote: "Order date 2026-10-27", page: 1 },
      currency: { value: "SGD", quote: "Currency: SGD", page: 1 },
      amount: { value: "2200.00", quote: "TOTAL (SGD) 2,200.00", page: 1 },
    },
    invoiceNumbers: [],
    dropped: [],
  },
  canWrite: true,
  customers: [MERIDIAN_LABS],
  customerMatch: MERIDIAN_LABS,
  payment: null,
  saved: null,
};

/** A document stored with AI off: no reading and no type yet. */
export const aiOffReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000108",
    label: "01_Invoice_Missing_Due_Date.pdf",
    kind: null,
    status: "needs-input",
    reason: "ai-off",
    fileUrl: "/demo-pack/01_Invoice_Missing_Due_Date.pdf",
  },
  reading: null,
  canWrite: true,
  customers: [],
  customerMatch: null,
  payment: null,
  saved: null,
};

/** The invoice review as a reader without write sees it. */
export const readOnlyReview: DocumentReviewView = {
  ...invoiceReview,
  canWrite: false,
};
