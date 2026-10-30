import { describe, expect, it } from "vitest";

import type { OpenInvoice, PaymentFacts, PaymentMatch } from "./decide.ts";
import { decidePaymentMatch } from "./decide.ts";

const OPEN: readonly OpenInvoice[] = [
  {
    invoiceId: "inv-0804",
    number: "INV-2026-08-04",
    invoiceDate: "2026-08-04",
    currency: "SGD",
    openCents: 405_000,
  },
  {
    invoiceId: "inv-0903",
    number: "INV-2026-09-03",
    invoiceDate: "2026-09-03",
    currency: "SGD",
    openCents: 520_000,
  },
  {
    invoiceId: "inv-0904",
    number: "INV-2026-09-04",
    invoiceDate: "2026-09-04",
    currency: "SGD",
    openCents: 420_000,
  },
  {
    invoiceId: "inv-1006",
    number: "INV-2026-10-06",
    invoiceDate: "2026-10-06",
    currency: "SGD",
    openCents: 950_000,
  },
  // Open amount equals no payment amount below, so rule 6 never suggests it.
  {
    invoiceId: "inv-usd",
    number: "INV-2026-09-10",
    invoiceDate: "2026-09-10",
    currency: "USD",
    openCents: 123_400,
  },
];

const SETTLED_0903 = OPEN.map((invoice) =>
  invoice.invoiceId === "inv-0903" ? { ...invoice, openCents: 0 } : invoice
);

function facts(overrides: Partial<PaymentFacts>): PaymentFacts {
  return {
    customerId: "customer-1",
    currency: "SGD",
    amountCents: 0,
    namedInvoiceNumbers: [],
    factsChecked: true,
    ...overrides,
  };
}

const TWO = ["INV-2026-08-04", "INV-2026-09-04"];

const ROWS: readonly {
  readonly row: string;
  readonly facts: PaymentFacts;
  readonly expected: PaymentMatch;
  readonly invoices?: readonly OpenInvoice[];
}[] = [
  {
    row: "B3.1 below the open balance links automatically",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 300_000,
    }),
    expected: {
      kind: "automatic",
      invoiceId: "inv-0903",
      amountCents: 300_000,
    },
  },
  {
    row: "B3.1 exactly the open balance links automatically",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 520_000,
    }),
    expected: {
      kind: "automatic",
      invoiceId: "inv-0903",
      amountCents: 520_000,
    },
  },
  {
    row: "B3.2 one cent above the open balance is an overpayment",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 520_001,
    }),
    expected: {
      kind: "overpayment",
      invoiceId: "inv-0903",
      amountCents: 520_000,
      unallocatedCents: 1,
    },
  },
  {
    row: "B3.3 unchecked facts wait for the person",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 300_000,
      factsChecked: false,
    }),
    expected: { kind: "confirm", invoiceId: "inv-0903", amountCents: 300_000 },
  },
  {
    row: "B3.4 two names, exact sum, split oldest first",
    facts: facts({ namedInvoiceNumbers: TWO, amountCents: 825_000 }),
    expected: {
      kind: "split",
      parts: [
        { invoiceId: "inv-0804", amountCents: 405_000 },
        { invoiceId: "inv-0904", amountCents: 420_000 },
      ],
      unallocatedCents: 0,
    },
  },
  {
    row: "B3.4 two names, more than the sum, rest unallocated",
    facts: facts({ namedInvoiceNumbers: TWO, amountCents: 900_000 }),
    expected: {
      kind: "split",
      parts: [
        { invoiceId: "inv-0804", amountCents: 405_000 },
        { invoiceId: "inv-0904", amountCents: 420_000 },
      ],
      unallocatedCents: 75_000,
    },
  },
  {
    row: "B3.4 two names, less than the sum, the newer one part paid",
    facts: facts({ namedInvoiceNumbers: TWO, amountCents: 500_000 }),
    expected: {
      kind: "split",
      parts: [
        { invoiceId: "inv-0804", amountCents: 405_000 },
        { invoiceId: "inv-0904", amountCents: 95_000 },
      ],
      unallocatedCents: 0,
    },
  },
  {
    row: "B3.4 two names, only one found, is a split of one part and never automatic",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03", "INV-UNKNOWN"],
      amountCents: 300_000,
    }),
    expected: {
      kind: "split",
      parts: [{ invoiceId: "inv-0903", amountCents: 300_000 }],
      unallocatedCents: 0,
    },
  },
  {
    row: "B3.5 no name, an open invoice of the exact amount is suggested",
    facts: facts({ amountCents: 950_000 }),
    expected: { kind: "suggestions", invoiceIds: ["inv-1006"] },
  },
  {
    row: "B3.5 no name and no exact amount is no match",
    facts: facts({ amountCents: 222_200 }),
    expected: { kind: "no-match" },
  },
  {
    row: "B3.5 a named invoice with nothing open is not found",
    facts: facts({
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 300_000,
    }),
    invoices: SETTLED_0903,
    expected: { kind: "no-match" },
  },
  {
    row: "B3.6 no customer is no match",
    facts: facts({
      customerId: null,
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 300_000,
    }),
    expected: { kind: "no-match" },
  },
  {
    row: "B3.7 case, space and repeat variants are one invoice",
    facts: facts({
      namedInvoiceNumbers: ["inv-2026-09-03 ", "INV-2026-09-03"],
      amountCents: 300_000,
    }),
    expected: {
      kind: "automatic",
      invoiceId: "inv-0903",
      amountCents: 300_000,
    },
  },
  {
    row: "B3.8 an invoice in another currency is never a candidate",
    facts: facts({
      currency: "USD",
      namedInvoiceNumbers: ["INV-2026-09-03"],
      amountCents: 300_000,
    }),
    expected: { kind: "no-match" },
  },
];

describe("decidePaymentMatch", () => {
  it.each(ROWS)("$row", ({ facts: paymentFacts, expected, invoices }) => {
    expect(decidePaymentMatch(paymentFacts, invoices ?? OPEN)).toEqual(
      expected
    );
  });
});
