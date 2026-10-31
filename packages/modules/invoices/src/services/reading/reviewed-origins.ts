import {
  READING_FIELDS,
  type ReadingField,
  type StoredReading,
} from "../../contract.ts";
import {
  normalizedInvoiceNumbers,
  normalizeInvoiceNumber,
} from "../matching/decide.ts";
import { centsOf } from "./quote-check.ts";

export type OriginField = ReadingField | "invoiceNumbers";

export type ReviewedFields = {
  readonly [F in ReadingField]?: string | null;
} & {
  readonly invoiceNumbers?: readonly string[];
};

export type ReviewedOrigin = "corrected" | "entered";

/** Empty or whitespace-only text counts as null. */
function filled(value: string | null): string | null {
  const text = value?.trim() ?? "";

  return text === "" ? null : text;
}

function same(field: ReadingField, read: string, typed: string): boolean {
  if (field === "amount") {
    const [readCents, typedCents] = [centsOf(read), centsOf(typed)];

    if (readCents !== undefined && typedCents !== undefined) {
      return readCents === typedCents;
    }
  }

  if (field === "customer") return read.toLowerCase() === typed.toLowerCase();

  if (field === "number") {
    return normalizeInvoiceNumber(read) === normalizeInvoiceNumber(typed);
  }

  return read === typed;
}

function originOf(
  held: boolean,
  sameValue: boolean,
  empty: boolean
): ReviewedOrigin | undefined {
  if (held) return sameValue ? undefined : "corrected";

  return empty ? undefined : "entered";
}

/**
 * The origin each reviewed field gets against the stored reading (czjw.27, decision 8). A read
 * field the person changed or cleared is `corrected`; a field the reading did not hold that the
 * person filled is `entered`. An unchanged or empty field is absent, and so is a key absent from
 * `reviewed`. The save and the review page both use this one rule, so it stays browser-safe.
 */
export function reviewedOrigins(
  reading: StoredReading,
  reviewed: ReviewedFields
): ReadonlyMap<OriginField, ReviewedOrigin> {
  const origins = new Map<OriginField, ReviewedOrigin>();

  for (const field of READING_FIELDS) {
    const value = reviewed[field];

    if (value === undefined) continue;

    const typed = filled(value);
    const read = reading.fields[field]?.value.trim();

    const origin = originOf(
      read !== undefined,
      read !== undefined && typed !== null && same(field, read, typed),
      typed === null
    );

    if (origin !== undefined) origins.set(field, origin);
  }

  if (reviewed.invoiceNumbers !== undefined) {
    const typed = normalizedInvoiceNumbers(reviewed.invoiceNumbers);

    const read = normalizedInvoiceNumbers(
      reading.invoiceNumbers.map(({ value }) => value)
    );

    const origin = originOf(
      read.length > 0,
      typed.join("\n") === read.join("\n"),
      typed.length === 0
    );

    if (origin !== undefined) origins.set("invoiceNumbers", origin);
  }

  return origins;
}
