import { omit } from "es-toolkit";

/**
 * Deterministic English fixtures for the document review stories.
 *
 * The values and quotes come from the S7-08 readings of the live demo files. They are not seed
 * data and they never reach a runtime path.
 */
import type { StoredReading } from "../../contract.ts";
import type { DocumentReviewView } from "../views.ts";
import { DEMO_PDF } from "./demo-pdfs.ts";

const ABC_TRADING = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "ABC Trading",
};

const MERIDIAN_LABS = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "MERIDIAN LABS",
};

const LUMI_DESIGN = {
  id: "20000000-0000-4000-8000-000000000003",
  name: "Lumi Design",
};

const HARBOR_FOODS = {
  id: "20000000-0000-4000-8000-000000000004",
  name: "Harbor Foods",
};

/** The checked reading of live upload 01 (read-01). */
const INVOICE_READING: StoredReading = {
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
};

/** Live upload 01: the invoice with no due date (read-01). */
export const invoiceReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000101",
    label: "01_Invoice_Missing_Due_Date.pdf",
    kind: "invoice",
    status: "needs-input",
    reason: null,
    fileUrl: DEMO_PDF.invoice01,
  },
  reading: INVOICE_READING,
  canWrite: true,
  customers: [ABC_TRADING],
  customerMatch: ABC_TRADING,
  payment: null,
  saved: null,
};

/** Upload 01 whose invoice date failed the quote check, so the reading holds no date (czjw.98). */
export const noQuoteInvoiceReview: DocumentReviewView = {
  ...invoiceReview,
  reading: {
    ...INVOICE_READING,
    fields: omit(INVOICE_READING.fields, ["date"]),
    dropped: ["date"],
  },
};

/** Upload 01 with a currency quote that the page text does not hold, so its card has no line. */
export const lostQuoteInvoiceReview: DocumentReviewView = {
  ...invoiceReview,
  reading: {
    ...INVOICE_READING,
    fields: {
      ...INVOICE_READING.fields,
      currency: { value: "SGD", quote: "Currency: XXX", page: 1 },
    },
  },
};

/** Upload 01 while its reading job still runs. */
export const readingReview: DocumentReviewView = {
  document: {
    id: invoiceReview.document.id,
    label: invoiceReview.document.label,
    kind: null,
    status: "reading",
    reason: null,
    fileUrl: `${DEMO_PDF.invoice01}?v=1`,
  },
  reading: null,
  canWrite: true,
  customers: [],
  customerMatch: null,
  payment: null,
  saved: null,
};

/** Upload 01 once its reading lands, with a fresh file link: the page must keep its first link. */
export const invoiceAfterReading: DocumentReviewView = {
  ...invoiceReview,
  document: {
    ...invoiceReview.document,
    fileUrl: `${DEMO_PDF.invoice01}?v=2`,
  },
};

/** Upload 01, whose reading could not finish. */
export const couldNotReadReview: DocumentReviewView = {
  ...readingReview,
  document: {
    ...readingReview.document,
    status: "could-not-read",
    fileUrl: DEMO_PDF.invoice01,
  },
};

/** Upload 01 after its reading failed and a person chose Invoice, to enter it by hand (R-26). */
export const couldNotReadTypedReview: DocumentReviewView = {
  ...couldNotReadReview,
  document: { ...couldNotReadReview.document, kind: "invoice" },
  customers: [ABC_TRADING],
};

/** Live upload 07: the purchase order that changes no figure (read-07). */
export const purchaseOrderReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000107",
    label: "07_Purchase_Order_Not_Proof_of_Payment.pdf",
    kind: "purchase-order",
    status: "kept-as-reference",
    reason: null,
    fileUrl: DEMO_PDF.order07,
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
    fileUrl: DEMO_PDF.invoice01,
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

/** Upload 01, whose reading names a customer that no stored customer matches (R-33). */
export const newCustomerReview: DocumentReviewView = {
  ...invoiceReview,
  reading: {
    ...INVOICE_READING,
    fields: {
      ...INVOICE_READING.fields,
      customer: {
        value: "Meridian Labs Pte",
        quote: "Bill to: Meridian Labs Pte",
        page: 1,
      },
    },
  },
  customers: [ABC_TRADING],
  customerMatch: null,
};

/** Upload 01 with a due date the reading passed the quote check (R-28). */
export const dueDateReadReview: DocumentReviewView = {
  ...invoiceReview,
  reading: {
    ...INVOICE_READING,
    fields: {
      ...INVOICE_READING.fields,
      dueDate: {
        value: "2026-11-30",
        quote: "Due date 2026-11-30",
        page: 1,
      },
    },
    dropped: [],
  },
};

/** Live upload 06: the paid sales receipt (read-06). */
export const receiptReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000106",
    label: "06_Paid_Sales_Receipt.pdf",
    kind: "paid-receipt",
    status: "needs-input",
    reason: null,
    fileUrl: DEMO_PDF.receipt06,
  },
  reading: {
    fields: {
      customer: {
        value: "Lumi Design",
        quote: "Customer: Lumi Design",
        page: 1,
      },
      number: {
        value: "RCPT-LIVE-001",
        quote: "Receipt number RCPT-LIVE-001",
        page: 1,
      },
      date: {
        value: "2026-10-27",
        quote: "Purchase / payment date 2026-10-27",
        page: 1,
      },
      currency: { value: "SGD", quote: "Currency: SGD", page: 1 },
      amount: { value: "1800.00", quote: "TOTAL (SGD) 1,800.00", page: 1 },
      reference: {
        value: "LD-PURCHASE-1800",
        quote: "Payment reference LD-PURCHASE-1800",
        page: 1,
      },
      method: { value: "Card", quote: "Payment method Card", page: 1 },
    },
    invoiceNumbers: [],
    dropped: [],
  },
  canWrite: true,
  customers: [LUMI_DESIGN],
  customerMatch: LUMI_DESIGN,
  payment: null,
  saved: null,
};

/** Upload 01, saved as an invoice with one automatic link (R-32). */
export const savedInvoiceReview: DocumentReviewView = {
  ...invoiceReview,
  document: { ...invoiceReview.document, status: "saved" },
  saved: {
    invoice: {
      id: "30000000-0000-4000-8000-000000000001",
      number: "INV-LIVE-001",
    },
    payment: null,
    automaticLinks: [
      {
        allocationId: "50000000-0000-4000-8000-000000000001",
        invoiceId: "30000000-0000-4000-8000-000000000001",
        invoiceNumber: "INV-LIVE-001",
        paymentId: "40000000-0000-4000-8000-000000000001",
        paymentReference: "HF-SEP-FINAL-PART",
        paymentDate: "2026-10-26",
        currency: "SGD",
        amountCents: 300000,
      },
    ],
  },
};

/** Live upload 02, saved as a payment the reading linked by itself (read-02, R-32). */
export const linkedAutomaticallyReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000102",
    label: "02_Payment_Partial_Existing_Invoice.pdf",
    kind: "payment",
    status: "linked-automatically",
    reason: null,
    fileUrl: DEMO_PDF.payment02,
  },
  reading: {
    fields: {
      customer: {
        value: "Harbor Foods",
        quote: "Harbor Foods",
        page: 1,
      },
      date: {
        value: "2026-10-26",
        quote: "Payment date 2026-10-26",
        page: 1,
      },
      currency: { value: "SGD", quote: "Currency SGD", page: 1 },
      amount: { value: "3000.00", quote: "TOTAL (SGD) 3,000.00", page: 1 },
      reference: {
        value: "HF-SEP-FINAL-PART",
        quote: "Payment reference HF-SEP-FINAL-PART",
        page: 1,
      },
      method: {
        value: "Bank transfer",
        quote: "Payment method Bank transfer",
        page: 1,
      },
    },
    invoiceNumbers: [
      {
        value: "INV-2026-09-03",
        quote: "Invoice reference INV-2026-09-03 | SGD 3,000.00",
        page: 1,
      },
    ],
    dropped: [],
  },
  canWrite: true,
  customers: [ABC_TRADING, MERIDIAN_LABS, LUMI_DESIGN, HARBOR_FOODS],
  customerMatch: HARBOR_FOODS,
  payment: null,
  saved: {
    invoice: null,
    payment: {
      id: "40000000-0000-4000-8000-000000000002",
      reference: "HF-SEP-FINAL-PART",
      paymentDate: "2026-10-26",
    },
    automaticLinks: [
      {
        allocationId: "50000000-0000-4000-8000-000000000002",
        invoiceId: "30000000-0000-4000-8000-000000000002",
        invoiceNumber: "INV-2026-09-03",
        paymentId: "40000000-0000-4000-8000-000000000002",
        paymentReference: "HF-SEP-FINAL-PART",
        paymentDate: "2026-10-26",
        currency: "SGD",
        amountCents: 300000,
      },
    ],
  },
};

const ORCHID_RETAIL = {
  id: "20000000-0000-4000-8000-000000000005",
  name: "Orchid Retail",
};

const ORCHID_AUG = "30000000-0000-4000-8000-000000000804";

const ORCHID_SEP = "30000000-0000-4000-8000-000000000904";

const ORCHID_OCT = "30000000-0000-4000-8000-000000001004";

/** Orchid Retail's open invoices at the reporting date, oldest first. */
const ORCHID_OPEN = [
  {
    invoiceId: ORCHID_AUG,
    number: "INV-2026-08-04",
    invoiceDate: "2026-08-04",
    dueDate: "2026-08-18",
    currency: "SGD",
    openCents: 405000,
  },
  {
    invoiceId: ORCHID_SEP,
    number: "INV-2026-09-04",
    invoiceDate: "2026-09-04",
    dueDate: "2026-09-30",
    currency: "SGD",
    openCents: 420000,
  },
  {
    invoiceId: ORCHID_OCT,
    number: "INV-2026-10-04",
    invoiceDate: "2026-10-04",
    dueDate: null,
    currency: "SGD",
    openCents: 435000,
  },
];

/** Meridian Labs' open invoices at the reporting date. */
export const meridianOpenInvoices = [
  {
    invoiceId: "30000000-0000-4000-8000-000000001006",
    number: "INV-2026-10-06",
    invoiceDate: "2026-10-06",
    dueDate: "2026-11-05",
    currency: "SGD",
    openCents: 950000,
  },
];

const ALL_CUSTOMERS = [
  ABC_TRADING,
  MERIDIAN_LABS,
  LUMI_DESIGN,
  HARBOR_FOODS,
  ORCHID_RETAIL,
];

/** The checked reading of live upload 03 (read-03). */
const SPLIT_READING: StoredReading = {
  fields: {
    customer: { value: "Orchid Retail", quote: "Orchid Retail", page: 1 },
    date: { value: "2026-10-27", quote: "Payment date 2026-10-27", page: 1 },
    currency: { value: "SGD", quote: "Currency SGD", page: 1 },
    amount: { value: "8250.00", quote: "TOTAL (SGD) 8,250.00", page: 1 },
    reference: {
      value: "OR-AUG-SEP-BUNDLE",
      quote: "Payment reference OR-AUG-SEP-BUNDLE",
      page: 1,
    },
    method: {
      value: "Bank transfer",
      quote: "Payment method Bank transfer",
      page: 1,
    },
  },
  invoiceNumbers: [
    {
      value: "INV-2026-08-04",
      quote: "Invoice reference INV-2026-08-04 | SGD 4,050.00",
      page: 1,
    },
    {
      value: "INV-2026-09-04",
      quote: "Invoice reference INV-2026-09-04 | SGD 4,200.00",
      page: 1,
    },
  ],
  dropped: [],
};

/** Live upload 03: one payment that names two invoices, proposed as a split (read-03, R-30). */
export const splitPaymentReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000103",
    label: "03_Payment_Covers_Two_Invoices.pdf",
    kind: "payment",
    status: "confirm-split",
    reason: null,
    fileUrl: DEMO_PDF.payment03,
  },
  reading: SPLIT_READING,
  canWrite: true,
  customers: ALL_CUSTOMERS,
  customerMatch: ORCHID_RETAIL,
  payment: {
    openInvoices: ORCHID_OPEN,
    proposal: {
      kind: "split",
      parts: [
        { invoiceId: ORCHID_AUG, amountCents: 405000 },
        { invoiceId: ORCHID_SEP, amountCents: 420000 },
      ],
      unallocatedCents: 0,
    },
    possibleDuplicateOf: null,
  },
  saved: null,
};

/** Upload 03 read as SGD 4,350 with no invoice named: one open invoice has that amount. */
export const suggestionsPaymentReview: DocumentReviewView = {
  ...splitPaymentReview,
  document: { ...splitPaymentReview.document, status: "no-match" },
  reading: {
    ...SPLIT_READING,
    fields: {
      ...SPLIT_READING.fields,
      amount: { value: "4350.00", quote: "TOTAL (SGD) 4,350.00", page: 1 },
    },
    invoiceNumbers: [],
  },
  payment: {
    openInvoices: ORCHID_OPEN,
    proposal: { kind: "suggestions", invoiceIds: [ORCHID_OCT] },
    possibleDuplicateOf: null,
  },
};

/** Upload 03 naming only INV-2026-08-04: SGD 8,250 is more than its open SGD 4,050. */
export const overpaymentPaymentReview: DocumentReviewView = {
  ...splitPaymentReview,
  reading: {
    ...SPLIT_READING,
    invoiceNumbers: SPLIT_READING.invoiceNumbers.slice(0, 1),
  },
  payment: {
    openInvoices: ORCHID_OPEN,
    proposal: {
      kind: "overpayment",
      invoiceId: ORCHID_AUG,
      amountCents: 405000,
      unallocatedCents: 420000,
    },
    possibleDuplicateOf: null,
  },
};

/** Live upload 05: Meridian Labs pays SGD 2,222 and names no invoice (read-05, R-31). */
export const noMatchPaymentReview: DocumentReviewView = {
  document: {
    id: "10000000-0000-4000-8000-000000000105",
    label: "05_Payment_Unmatched.pdf",
    kind: "payment",
    status: "no-match",
    reason: null,
    fileUrl: DEMO_PDF.payment05,
  },
  reading: {
    fields: {
      customer: { value: "Meridian Labs", quote: "Meridian Labs", page: 1 },
      date: { value: "2026-10-27", quote: "Payment date 2026-10-27", page: 1 },
      currency: { value: "SGD", quote: "Currency SGD", page: 1 },
      amount: { value: "2222.00", quote: "TOTAL (SGD) 2,222.00", page: 1 },
      reference: {
        value: "ML-UNREFERENCED",
        quote: "Payment reference ML-UNREFERENCED",
        page: 1,
      },
      method: {
        value: "Bank transfer",
        quote: "Payment method Bank transfer",
        page: 1,
      },
    },
    invoiceNumbers: [],
    dropped: [],
  },
  canWrite: true,
  customers: ALL_CUSTOMERS,
  customerMatch: MERIDIAN_LABS,
  payment: {
    openInvoices: meridianOpenInvoices,
    proposal: { kind: "no-match" },
    possibleDuplicateOf: null,
  },
  saved: null,
};

/** Upload 05 when a payment with the same date, amount and currency is saved already (R-33). */
export const duplicatePaymentReview: DocumentReviewView = {
  ...noMatchPaymentReview,
  document: { ...noMatchPaymentReview.document, status: "possible-duplicate" },
  payment: {
    openInvoices: meridianOpenInvoices,
    proposal: { kind: "no-match" },
    possibleDuplicateOf: "40000000-0000-4000-8000-000000000005",
  },
};
