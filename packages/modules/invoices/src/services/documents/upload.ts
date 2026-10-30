import { createHash } from "node:crypto";

import {
  AppError,
  type ModuleRequestContext,
  type TenantTransaction,
  withTransaction,
} from "@genie/core";
import { eq } from "drizzle-orm";

import type { UploadDocumentOutput } from "../../contract.ts";
import { INVOICE_ERRORS } from "../../errors.ts";
import { invoice, payment, sourceDocument } from "../../schema.ts";
import { assertCanWriteEverywhere } from "../ledger/access.ts";
import { enqueueReading } from "../reading/job.ts";
import { documentLabel } from "./label.ts";

const PDF_MAGIC = "%PDF-";

/** The stored document with this hash, as a duplicate answer, or undefined. */
async function duplicateOf(
  tx: TenantTransaction,
  sha256: string
): Promise<UploadDocumentOutput | undefined> {
  const [row] = await tx
    .select({ documentId: sourceDocument.id, label: documentLabel })
    .from(sourceDocument)
    .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
    .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
    .where(eq(sourceDocument.sha256, sha256));

  return row && { outcome: "duplicate", ...row };
}

/**
 * Stores one PDF once per exact file, unread, for the reading job (R-23). A document has no
 * customer yet, so the upload needs a tenant-wide `invoices:write` (decision 9). An exact copy
 * stores nothing and answers `duplicate` (decision 10). The declared type is not read, because a
 * browser can send none: the first bytes decide. A stored upload enqueues its reading job as the
 * uploader (decision 8).
 */
export async function uploadDocument(
  ctx: ModuleRequestContext,
  file: File
): Promise<UploadDocumentOutput> {
  await assertCanWriteEverywhere(ctx.caller);

  // Checked before the read, and before the file store, whose own size error answers 500.
  if (file.size > ctx.tenant.env.fileMaxBytes) {
    throw new AppError(INVOICE_ERRORS["document-too-large"]);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
    throw new AppError(INVOICE_ERRORS["document-not-pdf"]);
  }

  const fileName = file.name.trim() || "document.pdf";
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const answer = await withTransaction<UploadDocumentOutput>(
    ctx.tenant,
    async (tx) => {
      const stored = await duplicateOf(tx, sha256);

      if (stored !== undefined) return stored;

      const { id: fileId } = await ctx.tenant.fileStorage.store(
        {
          fileName,
          mimeType: "application/pdf",
          bytes,
          uploadedByUserId: ctx.caller.userId,
        },
        tx
      );

      const [created] = await tx
        .insert(sourceDocument)
        .values({
          fileId,
          sha256,
          kind: null,
          fileName,
          readingStatus: "reading",
        })
        .onConflictDoNothing({ target: sourceDocument.sha256 })
        .returning({ id: sourceDocument.id });

      if (created !== undefined) {
        return { outcome: "uploaded", documentId: created.id };
      }

      // A concurrent upload of the same bytes won the hash: drop this copy and answer with that one.
      await ctx.tenant.fileStorage.remove([fileId], tx);

      const winner = await duplicateOf(tx, sha256);

      if (winner === undefined) {
        throw new Error(
          `no document holds the hash ${sha256} after its conflict`
        );
      }

      return winner;
    }
  );

  if (answer.outcome === "uploaded") {
    // After the commit, so the job finds the row. A failed enqueue already left the document
    // Could not read, where Retry starts it again, so the stored upload still answers uploaded.
    await enqueueReading(ctx, answer.documentId).catch(() => undefined);
  }

  return answer;
}
