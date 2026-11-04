import {
  likePattern,
  modelStatus,
  type ModuleRequestContext,
  scopesFor,
} from "@genie/core";
import type { DatasetCursor } from "@genie/core/rpc";
import { readDayRange, readSort } from "@genie/ui/list-params";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  or,
  type SQL,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type {
  DocumentInboxRow,
  DocumentInboxView,
  DocumentListParams,
  DocumentStatus,
  InboxStatus,
} from "../../contract.ts";
import { documentListDefinition } from "../../presentation/list-definitions.ts";
import {
  allocation,
  customer,
  invoice,
  payment,
  type ReadingOutcome,
  sourceDocument,
} from "../../schema.ts";
import { assertCanReadEverywhere } from "../ledger/access.ts";
import { countsOf } from "../pages/lists.ts";
import { readingStalled } from "../reading/job.ts";
import { centsOf } from "../reading/quote-check.ts";
import {
  type StoredReading,
  storedReading,
} from "../reading/stored-reading.ts";
import { documentLabel } from "./label.ts";

/** The rows of one inbox page (LH6): one more is read to know that the list was cut. */
const INBOX_PAGE = 50;

/** A time as text with microseconds, the precision the column holds, so a cursor names its row. */
const microseconds = (column: SQLWrapper) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * A document's inbox status, one SQL rule in the order of decision 11: the job state, then a
 * purchase order, then the records saved from it, then the stored match outcome, else the
 * person's input. The list, its tabs and counts, the poll and the review all read it (LH20).
 */
const inboxStatus = sql<InboxStatus>`case
  when ${readingStalled} then 'could-not-read'
  when ${sourceDocument.readingStatus} <> 'read' then ${sourceDocument.readingStatus}
  when ${sourceDocument.kind} = 'purchase-order' then 'kept-as-reference'
  when exists (select 1 from ${allocation} where ${allocation.paymentId} = ${payment.id} and ${allocation.automatic}) then 'linked-automatically'
  when ${invoice.id} is not null or ${payment.id} is not null then 'saved'
  when ${sourceDocument.readingOutcome} in ('confirm-split', 'no-match', 'possible-duplicate') then ${sourceDocument.readingOutcome}
  else 'needs-input'
end`;

/**
 * The columns that decide a document's label, status and reason. Valid in a select that left
 * joins `invoice` and `payment` on `document_id`.
 */
export const documentState = {
  label: documentLabel,
  kind: sourceDocument.kind,
  readingOutcome: sourceDocument.readingOutcome,
  status: inboxStatus,
};

/** The customer of the record saved from a document, for the search (LH24). */
const recordCustomerId = sql`coalesce(${invoice.customerId}, ${payment.customerId})`;

/** Why a document needs input though nothing failed: AI is off, or it has no text layer. */
export function reasonOf(
  readingOutcome: ReadingOutcome | null
): DocumentInboxRow["reason"] {
  return readingOutcome === "ai-off" || readingOutcome === "no-text-layer"
    ? readingOutcome
    : null;
}

/** An invoice that a payment links to, apart from the invoice saved from the document. */
const linked = alias(invoice, "linked");

/**
 * The record saved from a document, as What we found shows it (LH30): its customer, currency and
 * amount, and its invoice numbers, which for a payment are the invoices it links to. Valid in a
 * select that left joins `invoice`, `payment` and the record's `customer`.
 */
const record = {
  recordCustomer: customer.name,
  recordCurrency: sql<
    string | null
  >`coalesce(${invoice.currency}, ${payment.currency})`,
  recordCents: sql<
    number | null
  >`coalesce(${invoice.totalCents}, ${payment.amountCents})`,
  recordNumbers: sql<string[] | null>`case
    when ${invoice.id} is not null then array[${invoice.number}]
    when ${payment.id} is not null then (
      select coalesce(array_agg(${linked.number} order by ${linked.number}), '{}')
      from ${allocation} join ${invoice} as ${sql.identifier("linked")} on ${linked.id} = ${allocation.invoiceId}
      where ${allocation.paymentId} = ${payment.id}
    )
  end`,
};

/**
 * What the inbox shows under What we found: the saved record when one exists, else the checked
 * values of the stored reading, or null before a reading. A seeded history document has a record
 * and no reading (`czjw.82`).
 */
function foundOf(document: {
  readonly reading: StoredReading | null;
  readonly recordCustomer: string | null;
  readonly recordCurrency: string | null;
  readonly recordCents: number | null;
  readonly recordNumbers: string[] | null;
}): DocumentInboxRow["found"] {
  if (document.recordNumbers !== null) {
    return {
      customer: document.recordCustomer,
      currency: document.recordCurrency,
      amountCents: document.recordCents,
      invoiceNumbers: document.recordNumbers,
    };
  }

  const { reading } = document;

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
 * The conditions of the address but the tab (LH24): the search over the file name, the saved
 * record's number or reference, its customer and the read customer, with `%` and `_` literal; the
 * type; and the upload day in the tenant zone. Valid in a select that also left joins `customer`
 * on the record's customer.
 */
function filtersOf(params: DocumentListParams, timeZone: string): SQL[] {
  const conditions: SQL[] = [];

  if (params.q !== undefined) {
    const pattern = likePattern(params.q);

    const found = or(
      sql`${sourceDocument.fileName} ilike ${pattern}`,
      sql`${invoice.number} ilike ${pattern}`,
      sql`${payment.reference} ilike ${pattern}`,
      sql`${customer.name} ilike ${pattern}`,
      sql`${sourceDocument.reading}->'fields'->'customer'->>'value' ilike ${pattern}`
    );

    if (found !== undefined) conditions.push(found);
  }

  if (params.type !== undefined) {
    conditions.push(eq(sourceDocument.kind, params.type));
  }

  const { from, to } = readDayRange(params.uploaded);
  const day = sql`(${sourceDocument.createdAt} at time zone ${timeZone})::date`;

  if (from !== undefined) conditions.push(sql`${day} >= ${from}::date`);

  if (to !== undefined) conditions.push(sql`${day} <= ${to}::date`);

  return conditions;
}

/** The statuses of the address's tab, Needs you when it names none, or none for All (LH20). */
function tabStatusesOf(params: DocumentListParams): readonly string[] {
  const { items } = documentListDefinition.tabs;
  const value = params.status ?? items[0].value;

  return items.find((item) => item.value === value)?.statuses ?? [];
}

/**
 * One page of the documents of a tab, with each label, kind, status and what was found (R-37). A
 * document has no customer before a save, so the list needs a tenant-wide `invoices:read`
 * (decision 12). The label is the file name, else the saved record's number (decision 13).
 *
 * The order is the sort column and then the id, both in the sort direction, which the
 * `(column, id)` indexes serve; `after` holds the column as text with microseconds and the id, so
 * a page edge never repeats or skips a document (czjw.49, czjw.71). Page one also answers the tab
 * counts, never narrowed by the tab (LH17).
 */
export async function loadDocumentInbox(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null,
  params: DocumentListParams = {}
): Promise<DocumentInboxView> {
  await assertCanReadEverywhere(ctx.caller);

  const branding = await ctx.tenant.branding.get();
  const filters = filtersOf(params, branding.defaultTimeZone);
  const statuses = tabStatusesOf(params);
  const sort = readSort(documentListDefinition, params.sort);

  const column =
    sort.column === "uploaded"
      ? sourceDocument.createdAt
      : sourceDocument.updatedAt;

  const order = sort.direction === "asc" ? asc : desc;
  const beyond = sort.direction === "asc" ? sql.raw(">") : sql.raw("<");

  const keyset =
    after === null
      ? undefined
      : or(
          sql`${column} ${beyond} ${String(after.values[0])}::timestamptz`,
          and(
            sql`${column} = ${String(after.values[0])}::timestamptz`,
            sql`${sourceDocument.id} ${beyond} ${String(after.values[1])}::uuid`
          )
        );

  const [documents, groups, status, writeScope] = await Promise.all([
    ctx.tenant.db
      .select({
        id: sourceDocument.id,
        sortKey: microseconds(column),
        uploadedAt: sourceDocument.createdAt,
        updatedAt: microseconds(sourceDocument.updatedAt),
        ...documentState,
        reading: sourceDocument.reading,
        ...record,
      })
      .from(sourceDocument)
      .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
      .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
      .leftJoin(customer, eq(customer.id, recordCustomerId))
      .where(
        and(
          ...filters,
          statuses.length === 0
            ? undefined
            : inArray(inboxStatus, [...statuses]),
          keyset
        )
      )
      .orderBy(order(column), order(sourceDocument.id))
      .limit(INBOX_PAGE + 1),
    after === null
      ? ctx.tenant.db
          .select({ status: inboxStatus, rows: sql<number>`count(*)::int` })
          .from(sourceDocument)
          .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
          .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
          .leftJoin(customer, eq(customer.id, recordCustomerId))
          .where(and(...filters))
          // By position: the status rule binds parameters, so a repeated expression would not match.
          .groupBy(sql`1`)
      : null,
    modelStatus(ctx.tenant),
    scopesFor(ctx.caller, "invoices:write"),
  ]);

  const last = documents[INBOX_PAGE - 1];

  return {
    rows: documents.slice(0, INBOX_PAGE).map((document) => ({
      id: document.id,
      label: document.label,
      kind: document.kind,
      status: document.status,
      reason: reasonOf(document.readingOutcome),
      uploadedAt: document.uploadedAt.toISOString(),
      updatedAt: document.updatedAt,
      found: foundOf(document),
    })),
    truncated: documents.length > INBOX_PAGE,
    next:
      documents.length > INBOX_PAGE && last !== undefined
        ? { values: [last.sortKey, last.id] }
        : null,
    counts: groups === null ? null : countsOf(documentListDefinition, groups),
    ai: status.state,
    canUpload: writeScope.kind === "all",
    timeZone: branding.defaultTimeZone,
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
    status: document.status,
    reason: reasonOf(document.readingOutcome),
  }));
}
