import { modelStatus, type ModuleRequestContext, scopesFor } from "@genie/core";
import type { DatasetCursor } from "@genie/core/rpc";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import type {
  DocumentInboxRow,
  DocumentInboxView,
  DocumentStatus,
  InboxStatus,
} from "../../contract.ts";
import {
  allocation,
  type DocumentKind,
  invoice,
  payment,
  type ReadingOutcome,
  type ReadingStatus,
  sourceDocument,
} from "../../schema.ts";
import { assertCanReadEverywhere } from "../ledger/access.ts";
import { readingStalled } from "../reading/job.ts";
import { centsOf } from "../reading/quote-check.ts";
import {
  type StoredReading,
  storedReading,
} from "../reading/stored-reading.ts";
import { documentLabel } from "./label.ts";

/** The lists' cap (czjw.28): one more row is read to know that the list was cut. */
const INBOX_ROW_CAP = 1000;

/**
 * The created time as text with microseconds, the precision the column holds. The cursor carries
 * this text, so a page edge never loses a row that shares a millisecond, and the id breaks the tie.
 */
const createdAtUs = sql<string>`to_char(${sourceDocument.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * A document's inbox status, in the order of decision 11: the job state, then a purchase order,
 * then the records saved from it, then the stored match outcome, else the person's input.
 */
export function inboxStatusOf(document: {
  readonly readingStatus: ReadingStatus;
  readonly kind: DocumentKind | null;
  readonly readingOutcome: ReadingOutcome | null;
  readonly hasRecord: boolean;
  readonly linkedAutomatically: boolean;
}): InboxStatus {
  if (document.readingStatus !== "read") return document.readingStatus;

  if (document.kind === "purchase-order") return "kept-as-reference";

  if (document.linkedAutomatically) return "linked-automatically";

  if (document.hasRecord) return "saved";

  switch (document.readingOutcome) {
    case "confirm-split":
    case "no-match":
    case "possible-duplicate":
      return document.readingOutcome;
    default:
      return "needs-input";
  }
}

/**
 * The columns that decide a document's label, status and reason, for `inboxStatusOf` and
 * `reasonOf`. Valid in a select that left joins `invoice` and `payment` on `document_id`.
 */
export const documentState = {
  label: documentLabel,
  kind: sourceDocument.kind,
  readingStatus: sql<ReadingStatus>`case when ${readingStalled} then 'could-not-read' else ${sourceDocument.readingStatus} end`,
  readingOutcome: sourceDocument.readingOutcome,
  hasRecord: sql<boolean>`(${invoice.id} is not null or ${payment.id} is not null)`,
  linkedAutomatically: sql<boolean>`exists (select 1 from ${allocation} where ${allocation.paymentId} = ${payment.id} and ${allocation.automatic})`,
};

/** Why a document needs input though nothing failed: AI is off, or it has no text layer. */
export function reasonOf(
  readingOutcome: ReadingOutcome | null
): DocumentInboxRow["reason"] {
  return readingOutcome === "ai-off" || readingOutcome === "no-text-layer"
    ? readingOutcome
    : null;
}

/** The checked values of a stored reading that the inbox shows, or null before a reading. */
function foundOf(reading: StoredReading | null): DocumentInboxRow["found"] {
  if (reading === null) return null;

  const { fields, invoiceNumbers } = storedReading.parse(reading);

  return {
    customer: fields.customer?.value ?? null,
    currency: fields.currency?.value ?? null,
    amountCents:
      (fields.amount === undefined
        ? undefined
        : centsOf(fields.amount.value)) ?? null,
    invoiceNumbers: invoiceNumbers.map(({ value }) => value),
  };
}

/**
 * Every document, newest first, with its label, kind, status and what was found (R-37). A
 * document has no customer before a save, so the list needs a tenant-wide `invoices:read`
 * (decision 12). The label is the file name, else the saved record's number (decision 13).
 *
 * `after` reads the page after a cut one (czjw.49): the order is the created time and then the id,
 * so a page edge never repeats or skips a document.
 */
export async function loadDocumentInbox(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null
): Promise<DocumentInboxView> {
  await assertCanReadEverywhere(ctx.caller);

  const [documents, status, writeScope] = await Promise.all([
    ctx.tenant.db
      .select({
        id: sourceDocument.id,
        // The cursor orders on the created time, which the row does not show.
        createdAt: createdAtUs,
        ...documentState,
        reading: sourceDocument.reading,
      })
      .from(sourceDocument)
      .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
      .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
      .where(
        after === null
          ? undefined
          : or(
              sql`${sourceDocument.createdAt} < ${String(after.values[0])}::timestamptz`,
              and(
                sql`${sourceDocument.createdAt} = ${String(after.values[0])}::timestamptz`,
                sql`${sourceDocument.id} < ${String(after.values[1])}::uuid`
              )
            )
      )
      .orderBy(desc(sourceDocument.createdAt), desc(sourceDocument.id))
      .limit(INBOX_ROW_CAP + 1),
    modelStatus(ctx.tenant),
    scopesFor(ctx.caller, "invoices:write"),
  ]);

  const last = documents[INBOX_ROW_CAP - 1];

  return {
    rows: documents.slice(0, INBOX_ROW_CAP).map((document) => ({
      id: document.id,
      label: document.label,
      kind: document.kind,
      status: inboxStatusOf(document),
      reason: reasonOf(document.readingOutcome),
      found: foundOf(document.reading),
    })),
    truncated: documents.length > INBOX_ROW_CAP,
    next:
      documents.length > INBOX_ROW_CAP && last !== undefined
        ? { values: [last.createdAt, last.id] }
        : null,
    ai: status.state,
    canUpload: writeScope.kind === "all",
  };
}

/**
 * The status of the named documents, for the inbox poll (czjw.49). The poll reads no reading
 * jsonb: a row still Reading has none, and the list reload after a finished reading brings the
 * found values. The read check is the list's, because a document has no customer before a save.
 */
export async function loadDocumentStatus(
  ctx: ModuleRequestContext,
  ids: readonly string[]
): Promise<DocumentStatus[]> {
  await assertCanReadEverywhere(ctx.caller);

  const documents = await ctx.tenant.db
    .select({ id: sourceDocument.id, ...documentState })
    .from(sourceDocument)
    .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
    .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
    .where(inArray(sourceDocument.id, [...ids]));

  return documents.map((document) => ({
    id: document.id,
    status: inboxStatusOf(document),
    reason: reasonOf(document.readingOutcome),
  }));
}
