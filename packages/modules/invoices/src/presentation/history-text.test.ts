import { describe, expect, it } from "vitest";

import { historySentence } from "./history-text.ts";
import type { HistoryRow } from "./views.ts";

const ROW: HistoryRow = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  invoiceId: "33333333-3333-4333-8333-333333333333",
  invoiceNumber: "INV-2026-09-03",
  paymentId: "44444444-4444-4444-8444-444444444444",
  paymentReference: "TRF-0921-118",
  paymentDate: "2026-09-21",
  currency: "SGD",
  automatic: true,
  action: "linked",
  occurredAt: "2026-09-21T03:15:00.000Z",
  amountBeforeCents: 0,
  amountAfterCents: 150_000,
};

const BY_A_PERSON = { ...ROW, automatic: false };

const CHANGED = {
  ...ROW,
  action: "changed",
  amountBeforeCents: 150_000,
  amountAfterCents: 120_000,
} as const;

const UNLINKED = {
  ...ROW,
  action: "unlinked",
  amountBeforeCents: 120_000,
  amountAfterCents: 0,
} as const;

const NO_REFERENCE = {
  ...ROW,
  paymentReference: null,
  paymentDate: "2026-10-02",
};

// The money format may join the currency with a no-break space.
const plain = (text: string) => text.replaceAll(" ", " ");

describe("historySentence", () => {
  it.each([
    [
      ROW,
      "payment",
      "Payment TRF-0921-118 linked automatically for SGD 1,500.00.",
    ],
    [
      BY_A_PERSON,
      "payment",
      "Payment TRF-0921-118 linked by a person for SGD 1,500.00.",
    ],
    [
      ROW,
      "invoice",
      "Invoice INV-2026-09-03 linked automatically for SGD 1,500.00.",
    ],
    [
      CHANGED,
      "payment",
      "Link to payment TRF-0921-118 changed from SGD 1,500.00 to SGD 1,200.00.",
    ],
    [
      UNLINKED,
      "invoice",
      "Invoice INV-2026-09-03 unlinked. SGD 1,200.00 returns to the payment as unallocated.",
    ],
    [
      NO_REFERENCE,
      "payment",
      "Payment 2 Oct 2026 linked automatically for SGD 1,500.00.",
    ],
  ] as const)(
    "%# names the other record and the amounts in words",
    (row, other, sentence) => {
      expect(plain(historySentence(row, other))).toBe(sentence);
    }
  );
});
