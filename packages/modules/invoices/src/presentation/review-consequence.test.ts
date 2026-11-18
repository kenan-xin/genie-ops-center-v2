import { describe, expect, it } from "vitest";

import { formatMoney } from "./format.ts";
import { consequenceOf } from "./review-consequence.ts";

const money = formatMoney(500_000, "SGD");

const invoice = {
  kind: "invoice" as const,
  totalCents: 500_000,
  currency: "SGD",
  dueDay: null,
  noDueDate: false,
};

// T4-a (czjw.193): what Save adds, in words, at the end of the form.
describe("consequenceOf", () => {
  it.each([
    [
      "a paid receipt",
      { ...invoice, kind: "paid-receipt" as const, dueDay: "2026-11-25" },
      `Saves a paid invoice of ${money}, with its payment and the allocation.`,
    ],
    [
      "an invoice with no due date",
      { ...invoice, noDueDate: true },
      `Saves an unpaid invoice of ${money} with no due date.`,
    ],
    [
      "an invoice with a due day",
      { ...invoice, dueDay: "2026-11-25" },
      `Saves an unpaid invoice of ${money}, due 25 Nov 2026.`,
    ],
    [
      "an invoice before a due choice",
      invoice,
      `Saves an unpaid invoice of ${money}.`,
    ],
    [
      "a lower-case currency with spaces",
      { ...invoice, currency: " sgd " },
      `Saves an unpaid invoice of ${money}.`,
    ],
  ])("states %s", (_, input, sentence) => {
    expect(consequenceOf(input)).toBe(sentence);
  });

  it.each([
    ["a total that does not read", { ...invoice, totalCents: undefined }],
    ["a currency that does not read", { ...invoice, currency: "SG" }],
  ])("states nothing for %s", (_, input) => {
    expect(consequenceOf(input)).toBeNull();
  });
});
