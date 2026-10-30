import {
  AppError,
  CORE_ERRORS,
  enqueueJob,
  type JobDeclaration,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { INVOICE_ERRORS } from "../../errors.ts";
import { type ReadingStatus, sourceDocument } from "../../schema.ts";
import { assertCanWriteEverywhere } from "../ledger/access.ts";
import { extractTextLayer } from "./text-layer.ts";

/** Two retries after the first run, with backoff (R-26, decision 4). */
export const READING_RETRY = {
  limit: 2,
  delaySeconds: 15,
  backoff: true,
} as const;

/** The runs of one reading: the first and its retries. The last failed one ends Could not read. */
export const READING_ATTEMPTS = READING_RETRY.limit + 1;

const readingData = z.object({ documentId: z.uuid() });

const inState = (documentId: string, status: ReadingStatus) =>
  and(
    eq(sourceDocument.id, documentId),
    eq(sourceDocument.readingStatus, status)
  );

/** Ends a reading that is still running; a late or second run finds nothing to change. */
async function endReading(
  tenant: TenantContext,
  documentId: string,
  values: Pick<
    typeof sourceDocument.$inferInsert,
    "readingStatus" | "readingOutcome"
  >
): Promise<void> {
  await tenant.db
    .update(sourceDocument)
    .set({ ...values, updatedAt: sql`now()` })
    .where(inState(documentId, "reading"));
}

/**
 * Reads one uploaded document as the person who started the job (R-12, decision 2). The job counts
 * its own attempts on the row, because the worker passes no attempt number (decision 3): a failed
 * run before the last rethrows so pg-boss retries it, and the last one ends Could not read and
 * completes. Every write names `reading_status = 'reading'`, so a run for a document that is read,
 * or that another run finished, changes nothing (R-26).
 */
export const readingJob: JobDeclaration<{ readonly documentId: string }> = {
  name: "invoices.read-document",
  retry: READING_RETRY,
  handler: async ({ tenant, caller }, data) => {
    const { documentId } = readingData.parse(data);

    // A job without a starter is not the uploader's: it claims nothing (R-12).
    if (caller === undefined) return;

    const [claimed] = await tenant.db
      .update(sourceDocument)
      .set({
        readingAttempts: sql`${sourceDocument.readingAttempts} + 1`,
        updatedAt: sql`now()`,
      })
      .where(inState(documentId, "reading"))
      .returning({
        attempt: sourceDocument.readingAttempts,
        fileId: sourceDocument.fileId,
      });

    if (claimed === undefined) return;

    try {
      const { bytes } = await tenant.fileStorage.fetch(claimed.fileId);
      const { hasText } = await extractTextLayer(bytes);

      // Until the model step lands, a document with text ends read with no outcome.
      await endReading(tenant, documentId, {
        readingStatus: "read",
        readingOutcome: hasText ? null : "no-text-layer",
      });
    } catch (error) {
      if (claimed.attempt < READING_ATTEMPTS) throw error;

      await endReading(tenant, documentId, { readingStatus: "could-not-read" });
    }
  },
};

/**
 * Enqueues the reading of a document as the caller. A failed enqueue leaves no job to end the
 * reading, so the document becomes Could not read, where Retry starts it again, and the error
 * goes on to the caller.
 */
export async function enqueueReading(
  ctx: ModuleRequestContext,
  documentId: string
): Promise<void> {
  try {
    await enqueueJob(ctx, readingJob, { documentId });
  } catch (error) {
    await endReading(ctx.tenant, documentId, {
      readingStatus: "could-not-read",
    });

    throw error;
  }
}

/**
 * Starts the reading of a Could not read document again, with its attempts back at 0. Only that
 * state is retried, so a second Retry while it reads is refused and enqueues nothing. Like the
 * upload, it needs a tenant-wide `invoices:write` (decision 12).
 */
export async function retryReading(
  ctx: ModuleRequestContext,
  documentId: string
): Promise<{ readonly documentId: string }> {
  await assertCanWriteEverywhere(ctx.caller);

  const [retried] = await ctx.tenant.db
    .update(sourceDocument)
    .set({
      readingStatus: "reading",
      readingAttempts: 0,
      updatedAt: sql`now()`,
    })
    .where(inState(documentId, "could-not-read"))
    .returning({ id: sourceDocument.id });

  if (retried === undefined) {
    const [stored] = await ctx.tenant.db
      .select({ id: sourceDocument.id })
      .from(sourceDocument)
      .where(eq(sourceDocument.id, documentId));

    throw new AppError(
      stored === undefined
        ? CORE_ERRORS["not-found"]
        : INVOICE_ERRORS["document-not-retryable"]
    );
  }

  await enqueueReading(ctx, documentId);

  return { documentId };
}
