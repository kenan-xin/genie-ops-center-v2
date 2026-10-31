/**
 * Deterministic English fixtures for the payment page stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type {
  PaymentListRow,
  PaymentListView,
  PaymentRecordView,
} from "../views.ts";

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
};

export const defaultPaymentList: PaymentListView = {
  asOf: "2026-10-27",
  rows: [ALLOCATED, PART_ALLOCATED, UNALLOCATED],
  truncated: false,
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

export const laterPaymentRecord: PaymentRecordView = {
  kind: "after-reporting-date",
  asOf: "2026-10-27",
  label: "Payment TRF-1028-301",
};
