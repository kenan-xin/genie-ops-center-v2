import {
  AppError,
  CORE_ERRORS,
  type TenantContext,
  type TenantTransaction,
} from "@genie/core";
import { and, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import { INVOICE_ERRORS } from "../../errors.ts";
import {
  type DocumentKind,
  fieldOrigin,
  invoice,
  payment,
  sourceDocument,
} from "../../schema.ts";
import { readingStalled } from "../reading/job.ts";

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

/**
 * Locks the document row, the first lock of every write on a document, so a save, a type change
 * and a discard of one document run one after another (README "Links"). Absent answers not-found.
 */
export async function lockDocument(tx: TenantTransaction, documentId: string) {
  const [row] = await tx
    .select({
      kind: sourceDocument.kind,
      readingStatus: sourceDocument.readingStatus,
      readingOutcome: sourceDocument.readingOutcome,
      fileId: sourceDocument.fileId,
      fileName: sourceDocument.fileName,
      readingStalled,
    })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId))
    .for("update");

  if (row === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  return row;
}

/** Refuses a document that an invoice or a payment was saved from. Call it under `lockDocument`. */
export async function assertNoRecord(
  tx: TenantTransaction,
  documentId: string
): Promise<void> {
  const invoices = await tx
    .select({ id: invoice.id })
    .from(invoice)
    .where(eq(invoice.documentId, documentId));

  const payments = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(eq(payment.documentId, documentId));

  if (invoices.length > 0 || payments.length > 0) {
    throw new AppError(INVOICE_ERRORS["document-already-saved"]);
  }
}

/** Locks the document and refuses one that is of a kind this save does not take (R-33). */
export async function assertDocumentKind(
  tx: TenantTransaction,
  documentId: string,
  kinds: readonly DocumentKind[]
): Promise<void> {
  const row = await lockDocument(tx, documentId);

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
  db: TenantContext["db"] | TenantTransaction,
  documentId: string
): Promise<boolean> {
  const [row] = await db
    .select({ checked: factsCheckedSql(sql`${documentId}::uuid`) })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  return row?.checked === true;
}
