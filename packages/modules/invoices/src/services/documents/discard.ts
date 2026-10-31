import {
  AppError,
  moduleAudit,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { eq } from "drizzle-orm";

import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { fieldOrigin, sourceDocument } from "../../schema.ts";
import { assertCanWriteEverywhere } from "../ledger/access.ts";
import { assertNoRecord, lockDocument } from "../ledger/documents.ts";

const audit = moduleAudit("invoices");

/**
 * Deletes a document with no saved record, its field origins and its file, in one transaction
 * (R-33, decision 7), so the same file uploads again as new. A document still being read is
 * refused, because its job would write to it, unless its reading stalled. It needs a tenant-wide `invoices:write`.
 */
export async function discardDocument(
  ctx: ModuleRequestContext,
  id: string
): Promise<{ readonly documentId: string }> {
  await assertCanWriteEverywhere(ctx.caller);

  return withTransaction(ctx.tenant, async (tx) => {
    const document = await lockDocument(tx, id);

    // A stalled reading shows as Could not read, the same as `retryReading` treats it.
    if (document.readingStatus === "reading" && !document.readingStalled) {
      throw new AppError(INVOICE_ERRORS["document-not-read"]);
    }

    await assertNoRecord(tx, id);

    await tx.delete(fieldOrigin).where(eq(fieldOrigin.documentId, id));
    await tx.delete(sourceDocument).where(eq(sourceDocument.id, id));
    await ctx.tenant.fileStorage.remove([document.fileId], tx);

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "invoices:document-discarded",
      { type: RECORD_TYPES.document, id },
      "Discarded a document.",
      { fileName: document.fileName ?? "Document" }
    );

    return { documentId: id };
  });
}
