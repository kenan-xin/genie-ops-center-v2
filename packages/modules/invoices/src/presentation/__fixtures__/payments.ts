/**
 * Deterministic English fixtures for the payment page stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type { OpenInvoiceRow } from "../../contract.ts";
import type {
  PaymentListPageView,
  PaymentListRow,
  PaymentListView,
  PaymentRecordView,
} from "../views.ts";

/** The tab counts of the three rows below: they never follow the tab (LH17). */
const PAYMENT_COUNTS = { "all": 3, "linked": 1, "not-linked": 2 };

const ALLOCATED: PaymentListRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reference: "TRF-0921-118",
  customerName: "Harbourline Trading",
  paymentDate: "2026-09-21",
  method: "Bank transfer",
  currency: "SGD",
  amountCents: 500_000,
  unallocatedCents: 0,
  status: "allocated",
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const PART_ALLOCATED: PaymentListRow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reference: null,
  customerName: "Kestrel Logistics",
  paymentDate: "2026-10-02",
  method: "Cheque",
  currency: "SGD",
  amountCents: 500_000,
  unallocatedCents: 200_000,
  status: "part-allocated",
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const UNALLOCATED: PaymentListRow = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  reference: "TRF-1003-204",
  customerName: "Marina Bay Interiors",
  paymentDate: "2026-10-03",
  method: null,
  currency: "SGD",
  amountCents: 350_000,
  unallocatedCents: 350_000,
  status: "unallocated",
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

const US_DOLLARS: PaymentListRow = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  reference: "WIRE-1010-055",
  customerName: "Cedar Point Studio",
  paymentDate: "2026-10-10",
  method: "Bank transfer",
  currency: "USD",
  amountCents: 75_000,
  unallocatedCents: 75_000,
  status: "unallocated",
  updatedAt: "2026-10-27T01:06:00.000000Z",
};

export const defaultPaymentList: PaymentListPageView = {
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  rows: [ALLOCATED, PART_ALLOCATED, UNALLOCATED],
  truncated: false,
  next: null,
  counts: PAYMENT_COUNTS,
  summary: [
    {
      currency: "SGD",
      collectedCents: 1_350_000,
      allocatedCents: 800_000,
      unallocatedCents: 550_000,
      count: 3,
      allocatedCount: 2,
      notLinkedCount: 2,
    },
  ],
  customers: [ALLOCATED, PART_ALLOCATED, UNALLOCATED, US_DOLLARS].map(
    (row, index) => ({
      id: `9${index}999999-9999-4999-8999-999999999999`,
      name: row.customerName,
    })
  ),
};

export const twoCurrencyPaymentList: PaymentListPageView = {
  ...defaultPaymentList,
  rows: [...defaultPaymentList.rows, US_DOLLARS],
  counts: { ...PAYMENT_COUNTS, "all": 4, "not-linked": 3 },
  summary: [
    ...(defaultPaymentList.summary ?? []),
    {
      currency: "USD",
      collectedCents: 75_000,
      allocatedCents: 0,
      unallocatedCents: 75_000,
      count: 1,
      allocatedCount: 0,
      notLinkedCount: 1,
    },
  ],
};

/** Page one under the Not linked chip, as `listPayments` answers it. */
export const notLinkedPaymentPage: PaymentListView = {
  asOf: "2026-10-27",
  rows: [PART_ALLOCATED, UNALLOCATED],
  truncated: false,
  next: null,
  counts: PAYMENT_COUNTS,
  summary: [
    {
      currency: "SGD",
      collectedCents: 850_000,
      allocatedCents: 300_000,
      unallocatedCents: 550_000,
      count: 2,
      allocatedCount: 1,
      notLinkedCount: 2,
    },
  ],
};

/** Page one under the Linked chip and a search, as `listPayments` answers it. */
export const linkedPaymentPage: PaymentListView = {
  asOf: "2026-10-27",
  rows: [ALLOCATED],
  truncated: false,
  next: null,
  counts: PAYMENT_COUNTS,
  summary: [
    {
      currency: "SGD",
      collectedCents: 500_000,
      allocatedCents: 500_000,
      unallocatedCents: 0,
      count: 1,
      allocatedCount: 1,
      notLinkedCount: 0,
    },
  ],
};

const LINK = {
  invoiceId: "33333333-3333-4333-8333-333333333333",
  invoiceNumber: "INV-2026-09-03",
  paymentId: PART_ALLOCATED.id,
  paymentReference: PART_ALLOCATED.reference,
  paymentDate: PART_ALLOCATED.paymentDate,
  currency: "SGD",
  automatic: true,
} as const;

const BY_A_PERSON = {
  ...LINK,
  invoiceId: "22222222-2222-4222-8222-222222222222",
  invoiceNumber: "INV-2026-10-02",
  automatic: false,
} as const;

type ShownPayment = Extract<PaymentRecordView, { kind: "shown" }>;

/**
 * Part-allocated, for a writer: an automatic link and a person's link to two invoices, their
 * changes and its source PDF.
 */
export const partAllocatedPaymentRecord: ShownPayment = {
  kind: "shown",
  asOf: "2026-10-27",
  timeZone: "Asia/Singapore",
  canWrite: true,
  payment: {
    ...PART_ALLOCATED,
    allocatedCents: 300_000,
    customerId: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
  },
  allocations: [
    {
      ...LINK,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      amountCents: 200_000,
    },
    {
      ...BY_A_PERSON,
      id: "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0",
      amountCents: 100_000,
    },
  ],
  history: [
    {
      ...LINK,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      action: "linked",
      occurredAt: "2026-10-02T03:15:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 200_000,
    },
    {
      ...BY_A_PERSON,
      id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0",
      action: "linked",
      occurredAt: "2026-10-03T01:05:00.000Z",
      amountBeforeCents: 0,
      amountAfterCents: 100_000,
    },
  ],
  documentUrl: "https://example.test/api/files/download?token=fixture",
};

/** The same payment for a reader without `invoices:write`. */
export const readOnlyPaymentRecord: ShownPayment = {
  ...partAllocatedPaymentRecord,
  canWrite: false,
};

/**
 * The open invoices of the part-allocated payment's customer in SGD: one below its 2,000.00
 * unallocated, one above it.
 */
export const openInvoicesOfPayment = {
  rows: [
    {
      invoiceId: "12121212-1212-4212-8212-121212121212",
      number: "INV-2026-10-07",
      invoiceDate: "2026-10-07",
      dueDate: "2026-11-06",
      currency: "SGD",
      openCents: 120_000,
    },
    {
      invoiceId: "13131313-1313-4313-8313-131313131313",
      number: "INV-2026-10-09",
      invoiceDate: "2026-10-09",
      dueDate: "2026-11-08",
      currency: "SGD",
      openCents: 450_000,
    },
  ],
  truncated: false,
} satisfies { rows: readonly OpenInvoiceRow[]; truncated: boolean };

export const laterPaymentRecord: PaymentRecordView = {
  kind: "after-reporting-date",
  asOf: "2026-10-27",
  label: "Payment TRF-1028-301",
};
