import {
  AppError,
  moduleAudit,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { eq, sql } from "drizzle-orm";

import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import {
  type DocumentKind,
  type ReadingOutcome,
  sourceDocument,
} from "../../schema.ts";
import { assertCanWriteEverywhere } from "../ledger/access.ts";
import { assertNoRecord, lockDocument } from "../ledger/documents.ts";

const audit = moduleAudit("invoices");

/** Outcomes that say why the reading left the fields to the person; a type change keeps them. */
const KEPT_OUTCOMES: ReadonlySet<ReadingOutcome | null> = new Set([
  "ai-off",
  "no-text-layer",
]);

/**
 * Changes the type of a read or Could not read document with no saved record (R-26, R-27,
 * decision 6). A document has no customer, so it needs a tenant-wide `invoices:write`. A match
 * outcome of the old type goes, because it no longer says anything about the document. The reading
 * status stays, so a Could not read document keeps Retry until a person saves it.
 */
export async function setDocumentKind(
  ctx: ModuleRequestContext,
  input: { readonly id: string; readonly kind: DocumentKind }
): Promise<{ readonly documentId: string; readonly kind: DocumentKind }> {
  await assertCanWriteEverywhere(ctx.caller);

  return withTransaction(ctx.tenant, async (tx) => {
    const document = await lockDocument(tx, input.id);

    // A stalled reading may still end, so it needs Retry first (R-26).
    if (document.readingStatus === "reading") {
      throw new AppError(INVOICE_ERRORS["document-not-read"]);
    }

    await assertNoRecord(tx, input.id);

    await tx
      .update(sourceDocument)
      .set({
        kind: input.kind,
        readingOutcome: KEPT_OUTCOMES.has(document.readingOutcome)
          ? document.readingOutcome
          : null,
        updatedAt: sql`now()`,
      })
      .where(eq(sourceDocument.id, input.id));

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "invoices:document-kind-changed",
      { type: RECORD_TYPES.document, id: input.id },
      "Changed the type of a document.",
      { from: document.kind ?? "none", to: input.kind }
    );

    return { documentId: input.id, kind: input.kind };
  });
}
