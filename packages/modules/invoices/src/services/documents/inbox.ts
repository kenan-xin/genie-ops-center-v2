import { modelStatus, type ModuleRequestContext, scopesFor } from "@genie/core";
import { desc, eq, sql } from "drizzle-orm";

import type {
  DocumentInboxRow,
  DocumentInboxView,
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
import { centsOf } from "../reading/quote-check.ts";
import {
  type StoredReading,
  storedReading,
} from "../reading/stored-reading.ts";
import { documentLabel } from "./label.ts";

/** The lists' cap (czjw.28): one more row is read to know that the list was cut. */
const INBOX_ROW_CAP = 1000;

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
 * shortcut: at most 1,000 rows; page past it with czjw.28
 */
export async function loadDocumentInbox(
  ctx: ModuleRequestContext
): Promise<DocumentInboxView> {
  await assertCanReadEverywhere(ctx.caller);

  const [documents, status, writeScope] = await Promise.all([
    ctx.tenant.db
      .select({
        id: sourceDocument.id,
        label: documentLabel,
        kind: sourceDocument.kind,
        readingStatus: sourceDocument.readingStatus,
        readingOutcome: sourceDocument.readingOutcome,
        reading: sourceDocument.reading,
        hasRecord: sql<boolean>`(${invoice.id} is not null or ${payment.id} is not null)`,
        linkedAutomatically: sql<boolean>`exists (select 1 from ${allocation} where ${allocation.paymentId} = ${payment.id} and ${allocation.automatic})`,
      })
      .from(sourceDocument)
      .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
      .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
      .orderBy(desc(sourceDocument.createdAt), desc(sourceDocument.id))
      .limit(INBOX_ROW_CAP + 1),
    modelStatus(ctx.tenant),
    scopesFor(ctx.caller, "invoices:write"),
  ]);

  return {
    rows: documents.slice(0, INBOX_ROW_CAP).map((document) => ({
      id: document.id,
      label: document.label,
      kind: document.kind,
      status: inboxStatusOf(document),
      reason:
        document.readingOutcome === "ai-off" ||
        document.readingOutcome === "no-text-layer"
          ? document.readingOutcome
          : null,
      found: foundOf(document.reading),
    })),
    truncated: documents.length > INBOX_ROW_CAP,
    ai: status.state,
    canUpload: writeScope.kind === "all",
  };
}
