import { describe, expect, it } from "vitest";

import type { OpenInvoiceRow } from "../contract.ts";
import { checkLinks, draftsOfProposal } from "./payment-links.ts";

const AUG = "30000000-0000-4000-8000-000000000804";

const SEP = "30000000-0000-4000-8000-000000000904";

const OPEN: readonly OpenInvoiceRow[] = [
  {
    invoiceId: AUG,
    number: "INV-2026-08-04",
    invoiceDate: "2026-08-04",
    dueDate: "2026-09-03",
    currency: "SGD",
    openCents: 405_000,
  },
  {
    invoiceId: SEP,
    number: "INV-2026-09-04",
    invoiceDate: "2026-09-04",
    dueDate: "2026-10-04",
    currency: "SGD",
    openCents: 420_000,
  },
];

const PAYMENT_CENTS = 825_000;

describe("the links of a payment under review", () => {
  // B6.1: integer cents, a link above its open amount, links above the payment, an unreadable amount.
  it("sums readable links in cents and flags each refusal the save would give", () => {
    expect(
      checkLinks(
        PAYMENT_CENTS,
        [
          { invoiceId: AUG, amountText: "4050.00" },
          { invoiceId: SEP, amountText: "4200.00" },
        ],
        OPEN
      )
    ).toEqual({
      allocatedCents: 825_000,
      unallocatedCents: 0,
      abovePayment: false,
      aboveOpen: [],
      unreadable: [],
    });

    expect(
      checkLinks(
        PAYMENT_CENTS,
        [
          { invoiceId: AUG, amountText: "4050.00" },
          { invoiceId: SEP, amountText: "4200.01" },
        ],
        OPEN
      )
    ).toEqual({
      allocatedCents: 825_001,
      unallocatedCents: 0,
      abovePayment: true,
      aboveOpen: [SEP],
      unreadable: [],
    });

    expect(
      checkLinks(
        PAYMENT_CENTS,
        [
          { invoiceId: AUG, amountText: "4050.00" },
          { invoiceId: SEP, amountText: "42,00.00" },
        ],
        OPEN
      )
    ).toEqual({
      allocatedCents: 405_000,
      unallocatedCents: 420_000,
      abovePayment: false,
      aboveOpen: [],
      unreadable: [SEP],
    });
  });

  // Design review 4.5: the fill shows separators like the lists.
  it("starts a split with each part's amount as the input shows it", () => {
    expect(
      draftsOfProposal({
        kind: "split",
        parts: [
          { invoiceId: AUG, amountCents: 405_000 },
          { invoiceId: SEP, amountCents: 420_000 },
        ],
        unallocatedCents: 0,
      })
    ).toEqual([
      { invoiceId: AUG, amountText: "4,050.00" },
      { invoiceId: SEP, amountText: "4,200.00" },
    ]);
  });
});
