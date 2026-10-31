import { describe, expect, it } from "vitest";

import type { StoredReading } from "../../contract.ts";
import { centsText } from "./quote-check.ts";
import { reviewedOrigins } from "./reviewed-origins.ts";

const onPage1 = (value: string) => ({ value, quote: value, page: 1 });

const READING: StoredReading = {
  fields: {
    customer: onPage1("ABC Trading"),
    number: onPage1("INV-LIVE-001"),
    amount: onPage1("8250.10"),
    description: onPage1("Consulting - October 2026"),
  },
  invoiceNumbers: [onPage1("INV-2026-08-04"), onPage1("INV-2026-09-04")],
  dropped: ["paymentTerms"],
};

describe("reviewed origins", () => {
  it("answers no mark for values typed back in another form", () => {
    expect(
      reviewedOrigins(READING, {
        customer: " abc trading",
        number: "inv-live-001",
        amount: centsText(825_010),
        invoiceNumbers: ["inv-2026-09-04", "inv-2026-08-04"],
      })
    ).toEqual(new Map());
    expect(reviewedOrigins(READING, { amount: "8250.1" })).toEqual(new Map());
  });

  it("marks a changed or cleared read field corrected and a filled unread field entered", () => {
    expect(
      reviewedOrigins(READING, {
        customer: "ABC Trading",
        amount: "8000.00",
        description: null,
        dueDate: "2026-11-30",
        paymentTerms: "30 days",
        method: null,
        reference: "  ",
      })
    ).toEqual(
      new Map([
        ["amount", "corrected"],
        ["description", "corrected"],
        ["dueDate", "entered"],
        ["paymentTerms", "entered"],
      ])
    );
  });

  it("writes cents as the decimal text of a reading", () => {
    expect([centsText(500_000), centsText(5), centsText(825_010)]).toEqual([
      "5000.00",
      "0.05",
      "8250.10",
    ]);
  });
});
