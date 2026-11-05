import type { StoredReading } from "@genie/module-invoices/contract";

/**
 * The question about a document on its review page that the app integration test and the dev e2e
 * share (S7-31, D12). The recorded model requests hold these values, so a change here re-records
 * `document-review-1.json` and `-2.json`.
 */

/** The keys of the person who asks, those of `INVOICE_ASK_PEOPLE` in the dev e2e. */
export const DOCUMENT_REVIEW_CHAT_KEYS = [
  "core:ask:use",
  "invoices:read",
  "invoices:use",
] as const;

/** A fixed id, so the recorded requests match on every run (D12). */
export const DOCUMENT_REVIEW_CHAT_ID = "9d2f6a1c-4b7e-4c8d-8e9f-0a0a0a0a0003";

const onPage1 = (value: string) => ({ value, quote: value, page: 1 });

/** An invoice reading with no due date, so the document needs input. */
export const DOCUMENT_REVIEW_CHAT_READING: StoredReading = {
  fields: {
    customer: onPage1("Harbor Foods"),
    number: onPage1("INV-2041"),
    date: onPage1("2026-10-01"),
    currency: onPage1("SGD"),
    amount: onPage1("1260.00"),
  },
  invoiceNumbers: [],
  dropped: [],
};

export const DOCUMENT_REVIEW_CHAT_MESSAGE = "What is wrong with this document?";

/** The page context of the review page, as `document-review.tsx` sends it. */
export const DOCUMENT_REVIEW_CHAT_CONTEXT = {
  page: "Document review",
  record: { type: "invoices-document", id: DOCUMENT_REVIEW_CHAT_ID },
} as const;
