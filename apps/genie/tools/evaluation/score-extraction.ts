import { centsOf } from "@genie/module-invoices/testing";

import type { ExpectedReading } from "./expected.ts";

type ReadField =
  | "customer"
  | "number"
  | "date"
  | "dueDate"
  | "paymentTerms"
  | "currency"
  | "amount"
  | "reference"
  | "method"
  | "description";

/** A reading as the quote check keeps it: each kept value as text, and the invoice numbers. */
export type ExtractedReading = {
  readonly kind: string;
  readonly fields: { readonly [Field in ReadField]?: string | undefined };
  readonly invoiceNumbers: readonly string[];
};

const TEXT_FIELDS = [
  "customer",
  "number",
  "date",
  "dueDate",
  "paymentTerms",
  "currency",
  "reference",
  "method",
  "description",
] as const;

/** Invoice numbers as one comparable text: trimmed, upper case, sorted. */
function numbers(values: readonly string[]): string {
  return values
    .map((value) => value.trim().toUpperCase())
    .toSorted()
    .join("\n");
}

export type ExtractionScore = {
  readonly pass: boolean;
  readonly mismatches: readonly string[];
};

/**
 * Scores one reading exactly (R-58): text after trim, money in whole cents through the reading's
 * own parser, invoice numbers as a set. An expected `null` means the document does not state the value, so a kept value fails.
 */
export function scoreExtraction(
  reading: ExtractedReading | null,
  expected: ExpectedReading
): ExtractionScore {
  if (reading === null) return { pass: false, mismatches: ["no-reading"] };

  const mismatches: string[] = [];

  if (reading.kind !== expected.kind) mismatches.push("kind");

  for (const field of TEXT_FIELDS) {
    const want = expected[field];

    if (want === undefined) continue;

    if ((reading.fields[field]?.trim() ?? null) !== want)
      mismatches.push(field);
  }

  if (expected.amountCents !== undefined) {
    const amount = reading.fields.amount;

    if (amount === undefined || centsOf(amount) !== expected.amountCents)
      mismatches.push("amount");
  }

  if (
    expected.invoiceNumbers !== undefined &&
    numbers(reading.invoiceNumbers) !== numbers(expected.invoiceNumbers)
  )
    mismatches.push("invoiceNumbers");

  return { pass: mismatches.length === 0, mismatches };
}
