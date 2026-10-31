import type { TenantTransaction } from "@genie/core";
import { and, eq, inArray, sql } from "drizzle-orm";

import { fieldOrigin, sourceDocument } from "../../schema.ts";
import {
  type OriginField,
  type ReviewedFields,
  type ReviewedOrigin,
  reviewedOrigins,
} from "../reading/reviewed-origins.ts";

/**
 * Writes the answer of `reviewedOrigins` for the document (czjw.27, decision 8). A `corrected`
 * field keeps its quote and page; an `entered` one has neither. A document with no stored
 * reading gets nothing. Each person's save calls it after its insert; the reading job does not.
 */
export async function markReviewedOrigins(
  tx: TenantTransaction,
  documentId: string,
  reviewed: ReviewedFields
): Promise<void> {
  const [row] = await tx
    .select({ reading: sourceDocument.reading })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

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
