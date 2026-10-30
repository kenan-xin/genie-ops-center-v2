import { AppError, CORE_ERRORS } from "@genie/core";
import { describe, expect, it } from "vitest";

import { INVOICE_ERRORS } from "../../errors.ts";
import type { ReadingOutcome } from "../../schema.ts";
import type { ReadingPaymentOutcome } from "../ledger/payments.ts";
import type { PaymentMatch } from "../matching/decide.ts";
import {
  paymentDraftOf,
  paymentOutcomeOf,
  settlesReading,
} from "./payment-draft.ts";
import type { ReadingField, StoredReading } from "./stored-reading.ts";

const DOCUMENT_ID = "8d3f6f5e-2b7a-4f43-9d55-6a0b8e9e1c11";

const onPage1 = (value: string) => ({ value, quote: value, page: 1 });

/** The checked reading of live upload 02. */
const READING_02: StoredReading = {
  fields: {
    customer: onPage1("Harbor Foods"),
    date: onPage1("2026-10-26"),
    currency: onPage1("SGD"),
    amount: onPage1("3000.00"),
    reference: onPage1("HF-SEP-FINAL-PART"),
    method: onPage1("Bank transfer"),
  },
  invoiceNumbers: [onPage1("INV-2026-09-03"), onPage1("INV-2026-09-04")],
  dropped: [],
};

const without = (
  reading: StoredReading,
  ...fields: ReadingField[]
): StoredReading => ({
  ...reading,
  fields: Object.fromEntries(
    Object.entries(reading.fields).filter(
      ([field]) => !fields.some((removed) => removed === field)
    )
  ),
});

const needsReview = (match: PaymentMatch): ReadingPaymentOutcome => ({
  outcome: "needs-review",
  customerId: "c1",
  match,
});

describe("payment drafts", () => {
  it("a reading with its four needed fields drafts the payment in cents, with the numbers as read", () => {
    expect(paymentDraftOf(DOCUMENT_ID, READING_02)).toEqual({
      documentId: DOCUMENT_ID,
      customerName: "Harbor Foods",
      paymentDate: "2026-10-26",
      currency: "SGD",
      amountCents: 300_000,
      reference: "HF-SEP-FINAL-PART",
      method: "Bank transfer",
      namedInvoiceNumbers: ["INV-2026-09-03", "INV-2026-09-04"],
    });
  });

  it("a reading without a reference or a method drafts them as null", () => {
    expect(
      paymentDraftOf(DOCUMENT_ID, without(READING_02, "reference", "method"))
    ).toMatchObject({ reference: null, method: null });
  });

  it.each<ReadingField>(["customer", "date", "currency", "amount"])(
    "a reading without its %s drafts nothing",
    (field) => {
      expect(
        paymentDraftOf(DOCUMENT_ID, without(READING_02, field))
      ).toBeUndefined();
    }
  );

  it.each<[string, ReadingPaymentOutcome, ReadingOutcome | null]>([
    [
      "saved",
      {
        outcome: "saved",
        paymentId: "p1",
        customerId: "c1",
        allocationId: "a1",
        invoiceId: "i1",
        amountCents: 300_000,
      },
      null,
    ],
    ["already-saved", { outcome: "already-saved", paymentId: "p1" }, null],
    [
      "split",
      needsReview({ kind: "split", parts: [], unallocatedCents: 0 }),
      "confirm-split",
    ],
    ["no-match", needsReview({ kind: "no-match" }), "no-match"],
    [
      "confirm",
      needsReview({ kind: "confirm", invoiceId: "i1", amountCents: 1 }),
      null,
    ],
    [
      "overpayment",
      needsReview({
        kind: "overpayment",
        invoiceId: "i1",
        amountCents: 1,
        unallocatedCents: 1,
      }),
      null,
    ],
    [
      "suggestions",
      needsReview({ kind: "suggestions", invoiceIds: ["i1"] }),
      null,
    ],
    [
      "possible-duplicate",
      { outcome: "possible-duplicate", duplicateOf: "p0" },
      "possible-duplicate",
    ],
  ])("the answer %s stores the outcome", (_, answer, outcome) => {
    expect(paymentOutcomeOf(answer)).toBe(outcome);
  });

  it.each<[string, boolean, unknown]>([
    ["forbidden", true, new AppError(CORE_ERRORS.forbidden)],
    [
      "document-already-saved",
      true,
      new AppError(INVOICE_ERRORS["document-already-saved"]),
    ],
    [
      "document-kind-mismatch",
      true,
      new AppError(INVOICE_ERRORS["document-kind-mismatch"]),
    ],
    ["not-found", false, new AppError(CORE_ERRORS["not-found"])],
    ["link-exists", false, new AppError(INVOICE_ERRORS["link-exists"])],
    ["a plain error named forbidden", false, new Error("forbidden")],
  ])("the error %s settles the reading: %s", (_, settles, error) => {
    expect(settlesReading(error)).toBe(settles);
  });
});
