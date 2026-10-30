/**
 * Deterministic English fixtures for the Documents inbox stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type { DocumentInboxRow, DocumentInboxView } from "../views.ts";

const ROWS: DocumentInboxRow[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    label: "reading.pdf",
    kind: null,
    status: "reading",
    reason: null,
    found: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    label: "broken.pdf",
    kind: null,
    status: "could-not-read",
    reason: null,
    found: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    label: "invoice.pdf",
    kind: "invoice",
    status: "needs-input",
    reason: null,
    found: {
      customer: "ABC Trading",
      currency: "SGD",
      amountCents: 500_000,
      invoiceNumbers: ["INV-LIVE-001"],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    label: "payment.pdf",
    kind: "payment",
    status: "linked-automatically",
    reason: null,
    found: {
      customer: "Harbor Foods",
      currency: "SGD",
      amountCents: 300_000,
      invoiceNumbers: ["INV-2026-09-03"],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    label: "split.pdf",
    kind: "payment",
    status: "confirm-split",
    reason: null,
    found: {
      customer: "Orchid Retail",
      currency: "SGD",
      amountCents: 825_000,
      invoiceNumbers: ["INV-2026-08-04", "INV-2026-09-04"],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    label: "possible-duplicate.pdf",
    kind: "payment",
    status: "possible-duplicate",
    reason: null,
    found: {
      customer: "Kestrel Logistics",
      currency: "SGD",
      amountCents: 120_000,
      invoiceNumbers: [],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    label: "unmatched.pdf",
    kind: "payment",
    status: "no-match",
    reason: null,
    found: {
      customer: "Meridian Labs",
      currency: "SGD",
      amountCents: 222_200,
      invoiceNumbers: [],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    label: "order.pdf",
    kind: "purchase-order",
    status: "kept-as-reference",
    reason: null,
    found: {
      customer: "Meridian Labs",
      currency: "SGD",
      amountCents: 220_000,
      invoiceNumbers: [],
    },
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    label: "saved.pdf",
    kind: "paid-receipt",
    status: "saved",
    reason: null,
    found: {
      customer: "Lumi Design",
      currency: "SGD",
      amountCents: 180_000,
      invoiceNumbers: [],
    },
  },
];

/** One row per inbox status, so a story shows every R-37 word. */
export const defaultDocumentInbox: DocumentInboxView = {
  rows: ROWS,
  truncated: false,
  ai: "on",
  canUpload: true,
};

export const aiOffDocumentInbox: DocumentInboxView = {
  ...defaultDocumentInbox,
  ai: "no-key",
};

export const readOnlyDocumentInbox: DocumentInboxView = {
  ...defaultDocumentInbox,
  canUpload: false,
};

export const emptyDocumentInbox: DocumentInboxView = {
  rows: [],
  truncated: false,
  ai: "on",
  canUpload: true,
};
