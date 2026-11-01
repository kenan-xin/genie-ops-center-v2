import { describe, expect, it } from "vitest";

import { type ExpectedReading, expectedReadingOf } from "./expected.ts";
import { type ExtractedReading, scoreExtraction } from "./score-extraction.ts";

/** The reading a perfect model gives for an expectation, as `checkReading` keeps it. */
function exact(expected: ExpectedReading): ExtractedReading {
  const cents = expected.amountCents;

  return {
    kind: expected.kind,
    fields: {
      customer: expected.customer,
      number: expected.number,
      date: expected.date,
      dueDate: expected.dueDate ?? undefined,
      paymentTerms: expected.paymentTerms ?? undefined,
      currency: expected.currency,
      amount: cents === undefined ? undefined : (cents / 100).toFixed(2),
      reference: expected.reference,
      method: expected.method,
      description: expected.description,
    },
    invoiceNumbers: expected.invoiceNumbers ?? [],
  };
}

describe("the extraction scorer", () => {
  it.each(["01", "02", "03", "04", "05", "06", "07"])(
    "passes the exact reading of document %s",
    (id) => {
      const expected = expectedReadingOf(id);

      expect(scoreExtraction(exact(expected), expected)).toEqual({
        pass: true,
        mismatches: [],
      });
    }
  );

  it("fails a payment whose amount is one cent off, and names the amount", () => {
    const expected = expectedReadingOf("02");
    const reading = exact(expected);
    const cents = (expected.amountCents ?? 0) + 1;

    expect(
      scoreExtraction(
        {
          ...reading,
          fields: { ...reading.fields, amount: (cents / 100).toFixed(2) },
        },
        expected
      )
    ).toEqual({ pass: false, mismatches: ["amount"] });
  });

  it("fails a purchase order read as a payment", () => {
    const expected = expectedReadingOf("07");

    expect(
      scoreExtraction({ ...exact(expected), kind: "payment" }, expected)
    ).toEqual({ pass: false, mismatches: ["kind"] });
  });

  it("fails the two-invoice payment when one invoice number is missing", () => {
    const expected = expectedReadingOf("03");
    const reading = exact(expected);

    expect(expected.invoiceNumbers).toHaveLength(2);
    expect(
      scoreExtraction(
        { ...reading, invoiceNumbers: reading.invoiceNumbers.slice(1) },
        expected
      )
    ).toEqual({ pass: false, mismatches: ["invoiceNumbers"] });
  });

  it("fails an invoice reading that fills the due date the document does not state", () => {
    const expected = expectedReadingOf("01");
    const reading = exact(expected);

    expect(expected.dueDate).toBeNull();
    expect(
      scoreExtraction(
        { ...reading, fields: { ...reading.fields, dueDate: "2026-11-30" } },
        expected
      )
    ).toEqual({ pass: false, mismatches: ["dueDate"] });
  });

  it("fails a case whose model call gave no reading", () => {
    expect(scoreExtraction(null, expectedReadingOf("01"))).toEqual({
      pass: false,
      mismatches: ["no-reading"],
    });
  });
});
