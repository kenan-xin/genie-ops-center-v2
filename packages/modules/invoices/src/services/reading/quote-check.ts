import type { z } from "zod";

import { cents, currencyCode, isoDate } from "../../contract.ts";
import type { ModelReading } from "./model-output.ts";
import {
  READING_FIELDS,
  type QuotedValue,
  type ReadingField,
  type StoredReading,
} from "./stored-reading.ts";

/** A thousands separator between digits: `5,000.00` and `5’000.00` are one figure. */
const THOUSANDS_SEPARATOR = /(?<=\d)[,'’](?=\d{3}(?!\d))/gu;

const WHITESPACE = /\s+/gu;

/** One base character and its combining marks, which NFKC may compose into one character. */
const CHARACTER_CLUSTER = /\p{L}\p{M}*|./uy;

/**
 * The NFKC of `text`, one source character at a time, with each result character and the index of
 * the source character it came from. NFKC may compose across a cluster boundary, for example two
 * Hangul jamo, so a cluster grows until its normalised form is what the whole-string result holds
 * at that point.
 */
function normalizedCharacters(text: string) {
  const normalized = text.normalize("NFKC");

  const characters: { readonly character: string; readonly source: number }[] =
    [];

  let position = 0;

  for (let at = 0; at < text.length;) {
    CHARACTER_CLUSTER.lastIndex = at;
    const first = CHARACTER_CLUSTER.exec(text)?.[0] ?? text[at] ?? "";
    let cluster = first;
    let piece = cluster.normalize("NFKC");

    while (
      !normalized.startsWith(piece, position) &&
      at + cluster.length < text.length
    ) {
      CHARACTER_CLUSTER.lastIndex = at + cluster.length;
      cluster +=
        CHARACTER_CLUSTER.exec(text)?.[0] ?? text[at + cluster.length] ?? "";
      piece = cluster.normalize("NFKC");
    }

    for (const character of piece) {
      characters.push({ character, source: at });
    }

    position += piece.length;
    at += Math.max(cluster.length, 1);
  }

  return characters;
}

/** NFKC, then a thousands separator between digits goes. Every result character keeps its source. */
function quoteCharacters(text: string) {
  const characters = normalizedCharacters(text);
  const joined = characters.map(({ character }) => character).join("");
  const indexAt = new Map<number, number>();
  let offset = 0;

  // Separator matches are UTF-16 offsets into `joined`, not indexes into `characters`.
  for (let index = 0; index < characters.length; index++) {
    indexAt.set(offset, index);
    offset += characters[index]?.character.length ?? 0;
  }

  const separators = new Set<number>();

  for (const match of joined.matchAll(THOUSANDS_SEPARATOR)) {
    const index =
      match.index === undefined ? undefined : indexAt.get(match.index);

    if (index !== undefined) separators.add(index);
  }

  return characters.filter((_, index) => !separators.has(index));
}

/** NFKC turns a no-break space into a space, then thousands separators go and whitespace collapses to one space. */
function spacedForQuote(text: string): string {
  return quoteCharacters(text)
    .map(({ character }) => character)
    .join("")
    .replaceAll(WHITESPACE, " ");
}

/**
 * `normalizeForQuote` and, for each UTF-16 unit of its result, the index of the source character.
 * `quoteRanges` searches `text` and indexes this map with UTF-16 offsets.
 */
export function normalizeForQuoteWithSource(text: string) {
  const kept = quoteCharacters(text).filter(
    ({ character }) => !/\s/u.test(character)
  );

  return {
    text: kept.map(({ character }) => character).join(""),
    source: kept.flatMap(({ character, source }) =>
      Array.from({ length: character.length }, () => source)
    ),
  };
}

/** The spaced form without any whitespace, so a line break or a split line still matches. */
export function normalizeForQuote(text: string): string {
  return normalizeForQuoteWithSource(text).text;
}

/** Integer arithmetic on the decimal string, never `parseFloat` times 100. */
export function centsOf(value: string): number | undefined {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) return undefined;

  const [, whole = "", fraction = ""] = match;
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return cents.safeParse(result).success ? result : undefined;
}

/** Integer cents as the decimal text that a reading stores: 500000 is "5000.00". Integer arithmetic only. */
export function centsText(amountCents: number): string {
  const fraction = amountCents % 100;

  return `${(amountCents - fraction) / 100}.${String(fraction).padStart(2, "0")}`;
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
 * What makes a number token part of another figure or a credit: a digit or decimal point or a
 * slash before it, a sign or an opening bracket before it with an optional currency between
 * ("-SGD 5,000.00", "- SGD 5,000.00", "(5,000.00)"), a dash or a slash after it, or CR or DR after it. A letter
 * alone does not, because "SGD5,000.00" is real (I-2).
 */
const AMOUNT_BOUNDS = {
  before: /(?:\d\.?|\/|[-−(]\s?\p{L}{0,3}\p{Sc}?\s?)$/u,
  after: /^(?:\.?\d|[-/]|\s?[CD]R(?!\p{L}))/iu,
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
 * neighbouring numbers never join, and never signed or part of a date. The token must also stand
 * so on the spaced page, because the page check ignores whitespace and a space the model
 * inserted would split "1500.00" (M-3). An identifier or a date stands as a whole token. Any other
 * value is a normalised substring.
 */
function standsInQuote(
  field: ReadingField | "invoiceNumbers",
  value: string,
  quote: string,
  pageText: string
): boolean {
  if (field === "amount") {
    const valueCents = centsOf(value);
    const spacedQuote = spacedForQuote(quote);
    const spacedPage = spacedForQuote(pageText);

    return (spacedQuote.match(/\d+(?:\.\d+)?/g) ?? []).some(
      (token) =>
        centsOf(token) === valueCents &&
        holdsWholeToken(spacedQuote, token, AMOUNT_BOUNDS) &&
        holdsWholeToken(spacedPage, token, AMOUNT_BOUNDS)
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
  answer: { value: string; quote: string; page: number },
  pages: readonly string[]
): QuotedValue | undefined {
  const value = answer.value.trim();
  const { quote, page } = answer;

  if (!Number.isInteger(page) || page < 1 || page > pages.length)
    return undefined;

  const normalizedQuote = normalizeForQuote(quote);
  const pageText = pages[page - 1] ?? "";

  if (
    normalizedQuote === "" ||
    !normalizeForQuote(pageText).includes(normalizedQuote)
  ) {
    return undefined;
  }

  if (!hasFormat(value) || !standsInQuote(field, value, quote, pageText))
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
    const answer = output[field];

    if (answer === null) continue;

    const passed = checked(field, HAS_FORMAT[field], answer, pages);

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
