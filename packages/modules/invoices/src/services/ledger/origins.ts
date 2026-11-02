import type { TenantTransaction } from "@genie/core";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { StoredReading } from "../../contract.ts";
import { fieldOrigin, sourceDocument } from "../../schema.ts";
import {
  type OriginField,
  type ReviewedFields,
  type ReviewedOrigin,
  reviewedOrigins,
} from "../reading/reviewed-origins.ts";

const NOTHING_READ: StoredReading = {
  fields: {},
  invoiceNumbers: [],
  dropped: [],
};

/**
 * Writes the answer of `reviewedOrigins` for the document (czjw.27, decision 8). A `corrected`
 * field keeps its quote and page; an `entered` one has neither. A Could not read document entered
 * by hand gets `corrected` for every filled field and every row a stored reading left, and becomes read, so a Retry cannot run the job
 * over the saved fields (R-26). Any other document with no stored reading gets nothing. Each
 * person's save calls it after its insert; the reading job does not.
 */
export async function markReviewedOrigins(
  tx: TenantTransaction,
  documentId: string,
  reviewed: ReviewedFields
): Promise<void> {
  const [row] = await tx
    .select({
      reading: sourceDocument.reading,
      readingStatus: sourceDocument.readingStatus,
    })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  if (row?.readingStatus === "could-not-read") {
    const filled = [...reviewedOrigins(NOTHING_READ, reviewed).keys()];

    if (filled.length > 0) {
      await tx
        .insert(fieldOrigin)
        .values(
          filled.map((field) => ({
            documentId,
            field,
            origin: "corrected" as const,
          }))
        )
        .onConflictDoNothing();
    }

    // A reading stored before a failed match left `extracted` rows; none was checked by a person.
    await tx
      .update(fieldOrigin)
      .set({ origin: "corrected", updatedAt: sql`now()` })
      .where(
        and(
          eq(fieldOrigin.documentId, documentId),
          eq(fieldOrigin.origin, "extracted")
        )
      );

    await tx
      .update(sourceDocument)
      .set({ readingStatus: "read", updatedAt: sql`now()` })
      .where(eq(sourceDocument.id, documentId));

    return;
  }

  if (row?.reading === null || row?.reading === undefined) return;

  const origins = [...reviewedOrigins(row.reading, reviewed)];

  const fieldsOf = (origin: ReviewedOrigin): OriginField[] =>
    origins.flatMap(([field, marked]) => (marked === origin ? [field] : []));

  const corrected = fieldsOf("corrected");
  const entered = fieldsOf("entered");

  if (corrected.length > 0) {
    await tx
      .update(fieldOrigin)
      .set({ origin: "corrected", updatedAt: sql`now()` })
      .where(
        and(
          eq(fieldOrigin.documentId, documentId),
          inArray(fieldOrigin.field, corrected)
        )
      );
  }

  if (entered.length > 0) {
    await tx
      .insert(fieldOrigin)
      .values(
        entered.map((field) => ({
          documentId,
          field,
          origin: "entered" as const,
        }))
      )
      .onConflictDoNothing();
  }
}
