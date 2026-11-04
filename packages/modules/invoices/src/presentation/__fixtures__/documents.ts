/**
 * Deterministic English fixtures for the Documents inbox stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not seed
 * data and they never reach a runtime path.
 */
import type { DocumentInboxRow, DocumentInboxView } from "../views.ts";

/** Uploaded on 27 Oct 2026 at 09:10 in Singapore, one minute earlier per row, so the list reads newest first. */
const uploadedAt = (row: number) =>
  new Date(Date.UTC(2026, 9, 27, 1, 11 - row)).toISOString();

/** Every fixture row last changed when it was uploaded. */
const withUpdated = (row: Omit<DocumentInboxRow, "updatedAt">) => ({
  ...row,
  updatedAt: row.uploadedAt,
});

const ROWS: Omit<DocumentInboxRow, "updatedAt">[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    uploadedAt: uploadedAt(1),
    label: "reading.pdf",
    kind: null,
    status: "reading",
    reason: null,
    found: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    uploadedAt: uploadedAt(2),
    label: "broken.pdf",
    kind: null,
    status: "could-not-read",
    reason: null,
    found: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    uploadedAt: uploadedAt(3),
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
    uploadedAt: uploadedAt(4),
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
    uploadedAt: uploadedAt(5),
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
    uploadedAt: uploadedAt(6),
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
    uploadedAt: uploadedAt(7),
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
    uploadedAt: uploadedAt(8),
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
    uploadedAt: uploadedAt(9),
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
  rows: ROWS.map(withUpdated),
  truncated: false,
  next: null,
  counts: { "needs-you": 5, "reading": 1, "done": 3, "all": 9 },
  ai: "on",
  canUpload: true,
  timeZone: "Asia/Singapore",
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
  ...defaultDocumentInbox,
  rows: [],
  counts: { "needs-you": 0, "reading": 0, "done": 0, "all": 0 },
};

const NEEDS_YOU = new Set([
  "needs-input",
  "confirm-split",
  "no-match",
  "possible-duplicate",
  "could-not-read",
]);

/** Page one under Needs you, the resting tab, as the page loader reads it (LH20). */
export const needsYouDocumentInbox: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: defaultDocumentInbox.rows.filter((row) => NEEDS_YOU.has(row.status)),
};

/** Nothing needs the person, but the inbox holds read and saved documents (`czjw.68`). */
export const nothingNeedsYouDocumentInbox: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [],
  counts: { "needs-you": 0, "reading": 1, "done": 30, "all": 31 },
};
