import type { z } from "zod";

import { cents, currencyCode, isoDate } from "../../contract.ts";
import type { ModelReading } from "./model-output.ts";
import {
  READING_FIELDS,
  type QuotedValue,
  type ReadingField,
  type StoredReading,
} from "./stored-reading.ts";

/** NFKC turns a no-break space into a space, then thousands separators go and whitespace collapses to one space. */
function spacedForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .replaceAll(/(?<=\d)[,'’](?=\d{3}(?!\d))/gu, "")
    .replaceAll(/\s+/gu, " ");
}

/** The spaced form without any whitespace, so a line break or a split line still matches. */
export function normalizeForQuote(text: string): string {
  return spacedForQuote(text).replaceAll(" ", "");
}

/** Integer arithmetic on the decimal string, never `parseFloat` times 100. */
export function centsOf(value: string): number | undefined {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) return undefined;

  const [, whole = "", fraction = ""] = match;
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return cents.safeParse(result).success ? result : undefined;
}

function length(max: number) {
  return (value: string) => value.length >= 1 && value.length <= max;
}

function matches(schema: z.ZodType) {
  return (value: string) => schema.safeParse(value).success;
}

/** The formats of the save inputs in `contract.ts`, so a checked value always fits a save. */
const HAS_FORMAT: Record<ReadingField, (value: string) => boolean> = {
  customer: length(200),
  number: length(64),
  date: matches(isoDate),
  dueDate: matches(isoDate),
  paymentTerms: length(500),
  currency: matches(currencyCode),
  amount: (value) => centsOf(value) !== undefined,
  reference: length(200),
  method: length(100),
  description: length(1000),
};

/** Fields that drive a link or a due date, where `INV-1` must not pass inside `INV-12`. */
const WHOLE_TOKEN_FIELDS = new Set<ReadingField | "invoiceNumbers">([
  "number",
  "invoiceNumbers",
  "date",
  "dueDate",
]);

/** What joins an identifier or a date to a longer token: a letter or a digit. */
const WORD_BOUNDS = {
  before: /[\p{L}\p{N}]$/u,
  after: /^[\p{L}\p{N}]/u,
};

/**
 * What makes a number token part of another figure: a digit or decimal point, a sign or a slash
 * before it, a dash or a slash after it. A letter does not, because "SGD5,000.00" is real (I-2).
 */
const AMOUNT_BOUNDS = {
  before: /(?:\d\.?|[-−/])$/u,
  after: /^(?:\.?\d|[-/])/u,
};

/** `token` occurs in `text` with nothing that `bounds` names directly before or after it. */
function holdsWholeToken(
  text: string,
  token: string,
  bounds = WORD_BOUNDS
): boolean {
  if (token === "") return false;

  for (
    let at = text.indexOf(token);
    at !== -1;
    at = text.indexOf(token, at + 1)
  ) {
    const before = text.slice(0, at);
    const after = text.slice(at + token.length);

    if (!bounds.before.test(before) && !bounds.after.test(after)) {
      return true;
    }
  }

  return false;
}

/**
 * An amount stands in its quote by an equal cents token, read with whitespace kept so that
 * neighbouring numbers never join, and never signed or part of a date. An identifier or a date
 * stands as a whole token. Any other
 * value is a normalised substring.
 */
function standsInQuote(
  field: ReadingField | "invoiceNumbers",
  value: string,
  quote: string
): boolean {
  if (field === "amount") {
    const valueCents = centsOf(value);
    const spacedQuote = spacedForQuote(quote);

    return (spacedQuote.match(/\d+(?:\.\d+)?/g) ?? []).some(
      (token) =>
        centsOf(token) === valueCents &&
        holdsWholeToken(spacedQuote, token, AMOUNT_BOUNDS)
    );
  }

  if (WHOLE_TOKEN_FIELDS.has(field)) {
    return holdsWholeToken(spacedForQuote(quote), spacedForQuote(value));
  }

  return normalizeForQuote(quote).includes(normalizeForQuote(value));
}

function checked(
  field: ReadingField | "invoiceNumbers",
  hasFormat: (value: string) => boolean,
  answer: { value: string; quote: string | null; page: number | null },
  pages: readonly string[]
): QuotedValue | undefined {
  const value = answer.value.trim();
  const { quote, page } = answer;

  if (quote === null || page === null) return undefined;

  if (!Number.isInteger(page) || page < 1 || page > pages.length)
    return undefined;

  const normalizedQuote = normalizeForQuote(quote);

  if (
    normalizedQuote === "" ||
    !normalizeForQuote(pages[page - 1] ?? "").includes(normalizedQuote)
  ) {
    return undefined;
  }

  if (!hasFormat(value) || !standsInQuote(field, value, quote))
    return undefined;

  return { value, quote, page };
}

/**
 * The one place that decides which values of a model reading count as `extracted` (R-25, R-30):
 * a value passes only when its quote is on the page it names and the value stands in its quote.
 */
export function checkReading(
  output: ModelReading,
  pages: readonly string[]
): StoredReading {
  const reading: StoredReading = {
    fields: {},
    invoiceNumbers: [],
    dropped: [],
  };

  for (const field of READING_FIELDS) {
    const { value, quote, page } = output[field];

    if (value === null) continue;

    const passed = checked(
      field,
      HAS_FORMAT[field],
      { value, quote, page },
      pages
    );

    if (passed) reading.fields[field] = passed;
    else reading.dropped.push(field);
  }

  const numbers = output.invoiceNumbers.map((item) =>
    checked("invoiceNumbers", length(64), item, pages)
  );

  if (numbers.length <= 20 && numbers.every((item) => item !== undefined)) {
    reading.invoiceNumbers = numbers;
  } else {
    reading.dropped.push("invoiceNumbers");
  }

  return reading;
}
