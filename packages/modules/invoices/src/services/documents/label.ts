import { type SQL, sql } from "drizzle-orm";

import { invoice, payment, sourceDocument } from "../../schema.ts";

/**
 * The label of a document: its file name, else the number of the invoice or the reference of the
 * payment saved from it, else "Document" (decision 13). Valid in a select that left joins
 * `invoice` and `payment` on `document_id`.
 */
export const documentLabel: SQL<string> = sql<string>`coalesce(${sourceDocument.fileName}, ${invoice.number}, ${payment.reference}, 'Document')`;
