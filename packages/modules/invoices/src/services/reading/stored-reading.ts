import { z } from "zod";

/** The fields a reading may return, each with its value, its quote and its page (R-24). */
export const READING_FIELDS = [
  "customer",
  "number",
  "date",
  "dueDate",
  "paymentTerms",
  "currency",
  "amount",
  "reference",
  "method",
  "description",
] as const;

export type ReadingField = (typeof READING_FIELDS)[number];

export const quotedValue = z.object({
  value: z.string(),
  quote: z.string(),
  page: z.number().int().positive(),
});

export type QuotedValue = z.infer<typeof quotedValue>;

/**
 * The checked reading on `document.reading`. A field in `fields` passed the quote check; a field
 * in `dropped` had a value that failed it ("check this", R-25); a field in neither was not on the
 * document.
 */
export const storedReading = z.object({
  fields: z.partialRecord(z.enum(READING_FIELDS), quotedValue),
  invoiceNumbers: z.array(quotedValue),
  dropped: z.array(z.enum([...READING_FIELDS, "invoiceNumbers"])),
});

export type StoredReading = z.infer<typeof storedReading>;
