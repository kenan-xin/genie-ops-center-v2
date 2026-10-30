import { AppError, CORE_ERRORS, type TenantTransaction } from "@genie/core";
import { and, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import { INVOICE_ERRORS } from "../../errors.ts";
import {
  type DocumentKind,
  fieldOrigin,
  sourceDocument,
} from "../../schema.ts";

/**
 * The fields of a document that must have passed the quote check before a payment links by
 * itself (R-30, decision 5). S7-08 writes them as `extracted`, and S7-09 marks a changed one
 * `corrected`.
 */
export const MATCH_FACT_FIELDS = [
  "customer",
  "invoiceNumbers",
  "amount",
] as const;

/** Refuses a document that is absent, or of a kind this save does not take (R-33). */
export async function assertDocumentKind(
  tx: TenantTransaction,
  documentId: string,
  kinds: readonly DocumentKind[]
): Promise<void> {
  const [row] = await tx
    .select({ kind: sourceDocument.kind })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  if (row === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  // A null kind is a document the reading job has not classified yet.
  if (row.kind === null || !kinds.includes(row.kind)) {
    throw new AppError(INVOICE_ERRORS["document-kind-mismatch"]);
  }
}

/** True when all of the document's `MATCH_FACT_FIELDS` rows are `extracted`. A null id is false. */
export function factsCheckedSql(documentId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`((select count(*) from ${fieldOrigin} where ${and(
    eq(fieldOrigin.documentId, documentId),
    inArray(fieldOrigin.field, [...MATCH_FACT_FIELDS]),
    eq(fieldOrigin.origin, "extracted")
  )}) = ${MATCH_FACT_FIELDS.length})`;
}

export async function factsChecked(
  tx: TenantTransaction,
  documentId: string
): Promise<boolean> {
  const [row] = await tx
    .select({ checked: factsCheckedSql(sql`${documentId}::uuid`) })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  return row?.checked === true;
}
