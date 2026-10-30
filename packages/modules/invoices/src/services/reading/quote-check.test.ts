import { describe, expect, it } from "vitest";

import type { ModelReading } from "./model-output.ts";
import { centsOf, checkReading } from "./quote-check.ts";
import type { StoredReading } from "./stored-reading.ts";

type Quoted = ModelReading["customer"];

const NOTHING: Quoted = { value: null, quote: null, page: null };

function reading(fields: Partial<ModelReading>): ModelReading {
  return {
    kind: "invoice",
    customer: NOTHING,
    number: NOTHING,
    date: NOTHING,
    dueDate: NOTHING,
    paymentTerms: NOTHING,
    currency: NOTHING,
    amount: NOTHING,
    reference: NOTHING,
    method: NOTHING,
    description: NOTHING,
    invoiceNumbers: [],
    ...fields,
  };
}

const LIVE_PAGE = "Bill to: ABC Trading\nInvoice number   INV-LIVE-001";

describe("the quote check", () => {
  it.each([
    [
      "the page has three spaces",
      "number",
      "INV-LIVE-001",
      "Invoice number INV-LIVE-001",
    ],
    [
      "the quote spans the line break",
      "customer",
      "ABC Trading",
      "ABC Trading Invoice number",
    ],
    [
      "the quote has a no-break space",
      "customer",
      "ABC Trading",
      "Bill to:\u00a0ABC Trading",
    ],
    [
      "the quote has a line break",
      "customer",
      "ABC Trading",
      "Bill to:\nABC Trading",
    ],
  ] as const)(
    "keeps a quote that differs from its page only in spacing: %s",
    (_, field, value, quote) => {
      const checked = checkReading(
        reading({ [field]: { value, quote, page: 1 } }),
        [LIVE_PAGE]
      );

      expect(checked).toEqual({
        fields: { [field]: { value, quote, page: 1 } },
        invoiceNumbers: [],
        dropped: [],
      });
    }
  );

  it("keeps an amount whose quote and page write the thousands separator differently", () => {
    const withSeparatorOnPage = checkReading(
      reading({
        amount: { value: "5000.00", quote: "TOTAL (SGD) 5000.00", page: 1 },
      }),
      ["TOTAL (SGD) 5,000.00"]
    );

    const withSeparatorInQuote = checkReading(
      reading({
        amount: { value: "5000.00", quote: "TOTAL (SGD) 5,000.00", page: 1 },
      }),
      ["TOTAL (SGD) 5000.00"]
    );

    expect(withSeparatorOnPage.fields.amount).toEqual({
      value: "5000.00",
      quote: "TOTAL (SGD) 5000.00",
      page: 1,
    });
    expect(withSeparatorInQuote.fields.amount).toEqual({
      value: "5000.00",
      quote: "TOTAL (SGD) 5,000.00",
      page: 1,
    });
  });

  it("drops a value whose quote is not on its page", () => {
    const checked = checkReading(
      reading({
        customer: {
          value: "Harbor Foods",
          quote: "Bill to: Harbor Foods",
          page: 1,
        },
      }),
      [LIVE_PAGE]
    );

    expect(checked).toEqual({
      fields: {},
      invoiceNumbers: [],
      dropped: ["customer"],
    });
  });

  it.each([
    ["the quote is on page 2 but names page 1", 1],
    ["page 0", 0],
    ["a page after the last page", 3],
  ])("drops a value whose page is wrong: %s", (_, page) => {
    const checked = checkReading(
      reading({
        number: {
          value: "INV-LIVE-001",
          quote: "Invoice number INV-LIVE-001",
          page,
        },
      }),
      ["Bill to: ABC Trading", "Invoice number INV-LIVE-001"]
    );

    expect(checked).toEqual({
      fields: {},
      invoiceNumbers: [],
      dropped: ["number"],
    });
  });

  it.each([
    ["500.00", "TOTAL (SGD) 5,000.00"],
    // A substring check passes this one: 5000.00 sits inside 15000.00.
    ["5000.00", "TOTAL (SGD) 15,000.00"],
    // Neighbouring numbers must not join into one token: 1 and 500.00 are two.
    ["1500.00", "Qty 1 500.00"],
    // A credit keeps its sign: 5000.00 here would link a refund as a payment.
    ["5000.00", "Credit note for INV-2026-09-03: -5,000.00"],
    // A part of a date is not an amount.
    ["26.00", "Payment date 2026-10-26"],
    ["2026.00", "Payment date 2026-10-26"],
  ])("drops the amount %s that its quote %s does not hold", (value, quote) => {
    const checked = checkReading(
      reading({ amount: { value, quote, page: 1 } }),
      [quote]
    );

    expect(checked).toEqual({
      fields: {},
      invoiceNumbers: [],
      dropped: ["amount"],
    });
  });

  it.each([
    "TOTAL (SGD) 5,000.00",
    "2026-10-26 5,000.00",
    // A currency written without a space before the amount.
    "TOTAL SGD5,000.00",
  ])("keeps the amount 5000.00 that its quote %s holds", (quote) => {
    const real = checkReading(
      reading({ amount: { value: "5000.00", quote, page: 1 } }),
      [quote]
    );

    expect(real.fields.amount).toEqual({ value: "5000.00", quote, page: 1 });
  });

  it.each<
    [string, Partial<ModelReading>, string, StoredReading["dropped"][number]]
  >([
    [
      "INV-1 as the number in For INV-12",
      { number: { value: "INV-1", quote: "For INV-12", page: 1 } },
      "For INV-12",
      "number",
    ],
    [
      "INV-1 as an invoice number in For INV-12",
      { invoiceNumbers: [{ value: "INV-1", quote: "For INV-12", page: 1 }] },
      "For INV-12",
      "invoiceNumbers",
    ],
    [
      "2026-10-02 as the date in Date 2026-10-025",
      { date: { value: "2026-10-02", quote: "Date 2026-10-025", page: 1 } },
      "Date 2026-10-025",
      "date",
    ],
  ])(
    "drops an identifier or date that is only part of a token: %s",
    (_, fields, page, field) => {
      const checked = checkReading(reading(fields), [page]);

      expect(checked).toEqual({
        fields: {},
        invoiceNumbers: [],
        dropped: [field],
      });
    }
  );

  it("keeps an invoice number that stands as a whole token in its spaced quote", () => {
    const checked = checkReading(
      reading({
        number: {
          value: "INV-LIVE-001",
          quote: "Invoice number INV-LIVE-001",
          page: 1,
        },
      }),
      [LIVE_PAGE]
    );

    expect(checked.fields.number).toEqual({
      value: "INV-LIVE-001",
      quote: "Invoice number INV-LIVE-001",
      page: 1,
    });
  });

  it("drops a customer taken from another line than its quote", () => {
    const checked = checkReading(
      reading({
        customer: {
          value: "ABC Trading",
          quote: "Bill to: Harbor Foods",
          page: 1,
        },
      }),
      ["Bill to: Harbor Foods\nShip to: ABC Trading"]
    );

    expect(checked).toEqual({
      fields: {},
      invoiceNumbers: [],
      dropped: ["customer"],
    });
  });

  it.each([
    [
      "a null value is absent",
      { value: null, quote: "Due date: 2026-11-30", page: 1 },
      [],
    ],
    [
      "a null quote is dropped",
      { value: "2026-11-30", quote: null, page: 1 },
      ["dueDate"],
    ],
    [
      "a null page is dropped",
      { value: "2026-11-30", quote: "Due date: 2026-11-30", page: null },
      ["dueDate"],
    ],
  ] as const)(
    "tells a missing value from an unquoted one: %s",
    (_, dueDate, dropped) => {
      const checked = checkReading(reading({ dueDate }), [
        "Due date: 2026-11-30",
      ]);

      expect(checked).toEqual({ fields: {}, invoiceNumbers: [], dropped });
    }
  );

  const LONG_NAME = "A".repeat(201);

  it.each([
    ["date", "26/10/2026", "Date: 26/10/2026"],
    ["currency", "sgd", "Currency: sgd"],
    ["amount", "5,000.00", "TOTAL 5,000.00"],
    ["amount", "-5.00", "TOTAL -5.00"],
    ["amount", "0.00", "TOTAL 0.00"],
    ["customer", LONG_NAME, `Bill to: ${LONG_NAME}`],
  ] as const)(
    "drops a %s that a save would refuse: %s",
    (field, value, quote) => {
      const checked = checkReading(
        reading({ [field]: { value, quote, page: 1 } }),
        [quote]
      );

      expect(checked).toEqual({
        fields: {},
        invoiceNumbers: [],
        dropped: [field],
      });
    }
  );

  it("drops the whole invoice number list when one number fails its quote", () => {
    const checked = checkReading(
      reading({
        kind: "payment",
        invoiceNumbers: [
          { value: "INV-2026-09-03", quote: "For INV-2026-09-03", page: 1 },
          { value: "INV-2026-09-04", quote: "and INV-2026-09-04", page: 1 },
        ],
      }),
      ["For INV-2026-09-03"]
    );

    expect(checked).toEqual({
      fields: {},
      invoiceNumbers: [],
      dropped: ["invoiceNumbers"],
    });
  });

  it.each([
    ["8250.00", 825000],
    ["0.1", 10],
    ["3000", 300000],
    ["21474836.47", 2147483647],
    ["21474836.48", undefined],
    ["1e3", undefined],
    ["5,000.00", undefined],
  ])("reads %s as %s cents", (value, expected) => {
    expect(centsOf(value)).toBe(expected);
  });
});
