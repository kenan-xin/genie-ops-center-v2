import type { StoredReading } from "./stored-reading.ts";

export type ExtractedOrigin = {
  readonly documentId: string;
  readonly field: string;
  readonly origin: "extracted";
  readonly quote: string;
  readonly page: number;
};

/** One `extracted` origin per kept value of a checked reading, and one for its invoice numbers (R-25, R-30). */
export function extractedOrigins(
  documentId: string,
  reading: StoredReading
): ExtractedOrigin[] {
  const origins = Object.entries(reading.fields).map(
    ([field, read]): ExtractedOrigin => ({
      documentId,
      field,
      origin: "extracted",
      quote: read.quote,
      page: read.page,
    })
  );

  const [firstNumber] = reading.invoiceNumbers;

  if (firstNumber !== undefined) {
    origins.push({
      documentId,
      field: "invoiceNumbers",
      origin: "extracted",
      quote: firstNumber.quote,
      page: firstNumber.page,
    });
  }

  return origins;
}
