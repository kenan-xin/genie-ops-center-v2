/**
 * Deterministic English fixtures for the invoice page stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type {
  InvoiceListPageView,
  InvoiceListRow,
  InvoiceListView,
  InvoiceRecordView,
} from "../views.ts";
import { DEMO_PDF } from "./demo-pdfs.ts";
import { RECORD_FIELDS_0903 } from "./desk.ts";

/** The tab counts of the four rows below: they never follow the tab (LH17). */
const INVOICE_COUNTS = {
  "all": 4,
  "open": 1,
  "overdue": 1,
  "paid": 1,
  "no-due-date": 1,
};

const PAID: InvoiceListRow = {
  id: "11111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-2026-09-01",
  customerName: "Harbourline Trading",
  invoiceDate: "2026-09-01",
  dueDate: "2026-09-15",
  currency: "SGD",
  totalCents: 720_000,
  outstandingCents: 0,
  status: { kind: "paid" },
  updatedAt: "2026-11-02T08:40:00.000000Z",
};

const OPEN: InvoiceListRow = {
  id: "22222222-2222-4222-8222-222222222222",
  invoiceNumber: "INV-2026-10-02",
  customerName: "Kestrel Logistics",
  invoiceDate: "2026-10-02",
  dueDate: "2026-11-01",
  currency: "SGD",
  totalCents: 520_000,
  outstandingCents: 520_000,
  status: { kind: "open" },
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const OVERDUE: InvoiceListRow = {
  id: "33333333-3333-4333-8333-333333333333",
  invoiceNumber: "INV-2026-09-03",
  customerName: "Marina Bay Interiors",
  invoiceDate: "2026-09-07",
  dueDate: "2026-09-17",
  currency: "SGD",
  totalCents: 500_000,
  outstandingCents: 300_000,
  status: { kind: "overdue", daysOverdue: 40 },
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const NO_DUE_DATE: InvoiceListRow = {
  id: "44444444-4444-4444-8444-444444444444",
  invoiceNumber: "INV-2026-09-04",
  customerName: "Orchard Print Works",
  invoiceDate: "2026-09-20",
  dueDate: null,
  currency: "SGD",
  totalCents: 435_000,
  outstandingCents: 435_000,
  status: { kind: "no-due-date" },
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const US_DOLLARS: InvoiceListRow = {
  id: "55555555-5555-4555-8555-555555555555",
  invoiceNumber: "INV-2026-10-05",
  customerName: "Cedar Point Studio",
  invoiceDate: "2026-10-05",
  dueDate: "2026-11-05",
  currency: "USD",
  totalCents: 125_000,
  outstandingCents: 125_000,
  status: { kind: "open" },
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const CUSTOMERS = [PAID, OPEN, OVERDUE, NO_DUE_DATE, US_DOLLARS].map(
  (row, index) => ({
    id: `9${index}999999-9999-4999-8999-999999999999`,
    name: row.customerName,
  })
);

export const defaultInvoiceList: InvoiceListPageView = {
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  rows: [PAID, OPEN, OVERDUE, NO_DUE_DATE],
  truncated: false,
  next: null,
  counts: INVOICE_COUNTS,
  summary: [
    {
      currency: "SGD",
      outstandingCents: 1_255_000,
      overdueCents: 300_000,
      overdueCount: 1,
      invoicedCents: 2_175_000,
      count: 36,
      unpaidCount: 7,
      paidCount: 29,
    },
  ],
  customers: CUSTOMERS,
};

export const twoCurrencyInvoiceList: InvoiceListPageView = {
  ...defaultInvoiceList,
  rows: [...defaultInvoiceList.rows, US_DOLLARS],
  counts: { ...INVOICE_COUNTS, all: 5, open: 2 },
  summary: [
    ...(defaultInvoiceList.summary ?? []),
    {
      currency: "USD",
      outstandingCents: 125_000,
      overdueCents: 0,
      overdueCount: 0,
      invoicedCents: 125_000,
      count: 1,
      unpaidCount: 1,
      paidCount: 0,
    },
  ],
};

/** Page one under the Overdue chip, as `listInvoices` answers it. */
export const overdueInvoicePage: InvoiceListView = {
  asOf: "2026-10-27",
  rows: [OVERDUE],
  truncated: false,
  next: null,
  counts: INVOICE_COUNTS,
  summary: [
    {
      currency: "SGD",
      outstandingCents: 300_000,
      overdueCents: 300_000,
      overdueCount: 1,
      invoicedCents: 500_000,
      count: 1,
      unpaidCount: 1,
      paidCount: 0,
    },
  ],
};

/** Page one under the Paid chip and a search, as `listInvoices` answers it. */
export const paidInvoicePage: InvoiceListView = {
  asOf: "2026-10-27",
  rows: [PAID],
  truncated: false,
  next: null,
  counts: INVOICE_COUNTS,
  summary: [
    {
      currency: "SGD",
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      invoicedCents: 720_000,
      count: 1,
      unpaidCount: 0,
      paidCount: 1,
    },
  ],
};

const PAYMENT = {
  invoiceId: OVERDUE.id,
  invoiceNumber: OVERDUE.invoiceNumber,
  paymentId: "66666666-6666-4666-8666-666666666666",
  paymentReference: "TRF-0921-118",
  paymentDate: "2026-09-21",
  currency: "SGD",
  automatic: true,
} as const;

const BY_A_PERSON = {
  ...PAYMENT,
  paymentId: "67676767-6767-4767-8767-676767676767",
  paymentReference: "TRF-0930-140",
  paymentDate: "2026-09-30",
  automatic: false,
} as const;

type ShownInvoice = Extract<InvoiceRecordView, { kind: "shown" }>;

/**
 * Part-paid and overdue by 40 days, for a writer: an automatic link and a person's link, their
 * changes and its source PDF.
 */
export const partPaidInvoiceRecord: ShownInvoice = {
  kind: "shown",
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  canWrite: true,
  invoice: {
    ...OVERDUE,
    dueDateSource: "document",
    paymentTerms: "Net 10",
    description: "Showroom fit-out, phase 1",
    allocatedCents: 200_000,
  },
  allocations: [
    {
      ...PAYMENT,
      id: "77777777-7777-4777-8777-777777777777",
      amountCents: 150_000,
    },
    {
      ...BY_A_PERSON,
      id: "78787878-7878-4878-8878-787878787878",
      amountCents: 50_000,
    },
  ],
  history: [
    {
      ...PAYMENT,
      id: "88888888-8888-4888-8888-888888888888",
      action: "linked",
      occurredAt: "2026-09-21T02:15:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 150_000,
    },
    {
      ...BY_A_PERSON,
      id: "89898989-8989-4989-8989-898989898989",
      action: "linked",
      occurredAt: "2026-09-30T03:40:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 50_000,
    },
  ],
  // The link stories load no file; `deskInvoiceRecord` shows the page.
  documentUrl: null,
  fields: [],
};

const HARBOR_INVOICE = {
  invoiceId: "34343434-3434-4343-8343-343434343434",
  invoiceNumber: "INV-2026-09-03",
  currency: "SGD",
} as const;

const TXN_026 = {
  ...HARBOR_INVOICE,
  paymentId: "35353535-3535-4353-8353-353535353535",
  paymentReference: "TXN-PAY-2026-026",
  paymentDate: "2026-10-05",
  automatic: false,
} as const;

const HF_FINAL = {
  ...HARBOR_INVOICE,
  paymentId: "36363636-3636-4363-8363-363636363636",
  paymentReference: "HF-SEP-FINAL-PART",
  paymentDate: "2026-10-26",
  automatic: true,
} as const;

/**
 * The history invoice INV-2026-09-03 on the document desk (prototype variant C): part-paid by a
 * person's link and an automatic one, overdue by 40 days, with its PDF and its field sources.
 */
export const deskInvoiceRecord: ShownInvoice = {
  kind: "shown",
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  canWrite: true,
  invoice: {
    id: HARBOR_INVOICE.invoiceId,
    invoiceNumber: HARBOR_INVOICE.invoiceNumber,
    customerName: "Harbor Foods",
    invoiceDate: "2026-09-03",
    dueDate: "2026-09-17",
    currency: "SGD",
    totalCents: 720_000,
    outstandingCents: 220_000,
    status: { kind: "overdue", daysOverdue: 40 },
    updatedAt: "2026-10-26T04:00:00.000000Z",
    dueDateSource: "document",
    paymentTerms: "Payment due within 14 days of invoice date.",
    description: "Operations support services - September 2026",
    allocatedCents: 500_000,
  },
  allocations: [
    {
      ...TXN_026,
      id: "37373737-3737-4373-8373-373737373737",
      amountCents: 200_000,
    },
    {
      ...HF_FINAL,
      id: "38383838-3838-4383-8383-383838383838",
      amountCents: 300_000,
    },
  ],
  history: [
    {
      ...TXN_026,
      id: "39393939-3939-4393-8393-393939393939",
      action: "linked",
      occurredAt: "2026-10-05T04:00:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 150_000,
    },
    {
      ...TXN_026,
      id: "3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a",
      action: "changed",
      occurredAt: "2026-10-06T02:30:00.000Z",
      amountBeforeCents: 150_000,
      amountAfterCents: 200_000,
    },
    {
      ...HF_FINAL,
      id: "3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b",
      action: "linked",
      occurredAt: "2026-10-26T04:00:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 300_000,
    },
  ],
  documentUrl: DEMO_PDF.history0903,
  fields: [...RECORD_FIELDS_0903],
};

/** The same invoice for a reader without `invoices:write`. */
export const readOnlyInvoiceRecord: ShownInvoice = {
  ...partPaidInvoiceRecord,
  canWrite: false,
};

/** Paid in full by two links of 3,000.00 and 2,000.00, for a correction below its links (R-32). */
export const linkedInFullInvoiceRecord: ShownInvoice = {
  ...partPaidInvoiceRecord,
  invoice: {
    ...partPaidInvoiceRecord.invoice,
    allocatedCents: 500_000,
    outstandingCents: 0,
    status: { kind: "paid" },
  },
  allocations: [
    {
      ...PAYMENT,
      id: "77777777-7777-4777-8777-777777777777",
      amountCents: 300_000,
    },
    {
      ...BY_A_PERSON,
      id: "78787878-7878-4878-8878-787878787878",
      amountCents: 200_000,
    },
  ],
};

export const noDueDateInvoiceRecord: InvoiceRecordView = {
  kind: "shown",
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  canWrite: true,
  invoice: {
    ...NO_DUE_DATE,
    dueDateSource: "unspecified",
    paymentTerms: null,
    description: null,
    allocatedCents: 0,
  },
  allocations: [],
  history: [],
  documentUrl: null,
  fields: [],
};

export const laterInvoiceRecord: InvoiceRecordView = {
  kind: "after-reporting-date",
  asOf: "2026-10-27",
  label: "INV-2026-10-06",
};
