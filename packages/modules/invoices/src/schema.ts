import { migrationsFromJournal } from "@genie/core";
import { type AnyColumn, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import journal from "../drizzle/meta/_journal.json" with { type: "json" };
import { DUE_DATE_SOURCES } from "./contract.ts";
import type { StoredReading } from "./services/reading/stored-reading.ts";

export const DOCUMENT_KINDS = [
  "invoice",
  "payment",
  "paid-receipt",
  "purchase-order",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Where a document's reading job stands. A document stored before reading existed is `read`. */
export const READING_STATUSES = ["reading", "could-not-read", "read"] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];

/** Why a read document still needs the person, when the reading itself decided it. */
export const READING_OUTCOMES = [
  "confirm-split",
  "no-match",
  "possible-duplicate",
  "ai-off",
  "no-text-layer",
] as const;

export type ReadingOutcome = (typeof READING_OUTCOMES)[number];

export const FIELD_ORIGINS = ["extracted", "entered", "corrected"] as const;

export const ALLOCATION_ACTIONS = ["linked", "changed", "unlinked"] as const;

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/** A check that holds a text column to one of the declared values. */
const oneOf = (column: AnyColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

const currencyCode = (column: AnyColumn) => sql`${column} ~ '^[A-Z]{3}$'`;

// An edited table carries both timestamps (data-shape rule 5).
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The module's own tables (R-22). Every amount is an integer of cents beside its currency, and a
 * balance is never stored: it is the invoice total minus its allocations. Core never reads these
 * tables, and they exist only in an image that includes this module (DEC-33).
 */
export const customer = pgTable(
  "customer",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("customer_name_key").on(sql`lower(btrim(${table.name}))`),
  ]
);

/** The table is `document`; the export name keeps clear of the DOM global `document`. */
export const sourceDocument = pgTable(
  "document",
  {
    id: id(),
    /** The core `file.id`, by id with no foreign key (data-shape module rule 2). */
    fileId: uuid("file_id").notNull(),
    /** One stored copy per exact file (R-34). */
    sha256: text("sha256").notNull().unique("document_sha256_key"),
    /** Null until the reading job classifies the document. */
    kind: text("kind", { enum: DOCUMENT_KINDS }),
    /** The uploaded name. Null on a document stored before uploads kept it. */
    fileName: text("file_name"),
    readingStatus: text("reading_status", { enum: READING_STATUSES })
      .notNull()
      .default("read"),
    /** The job counts its own attempts: the core worker passes no attempt number. */
    readingAttempts: integer("reading_attempts").notNull().default(0),
    readingOutcome: text("reading_outcome", { enum: READING_OUTCOMES }),
    /** The reading after the quote check, null until the model step stores it. */
    reading: jsonb("reading").$type<StoredReading>(),
    ...timestamps(),
  },
  (table) => [
    check("document_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("document_kind_check", oneOf(table.kind, DOCUMENT_KINDS)),
    check(
      "document_reading_status_check",
      oneOf(table.readingStatus, READING_STATUSES)
    ),
    check(
      "document_reading_attempts_check",
      sql`${table.readingAttempts} >= 0`
    ),
    check(
      "document_reading_outcome_check",
      oneOf(table.readingOutcome, READING_OUTCOMES)
    ),
  ]
);

export const invoice = pgTable(
  "invoice",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    documentId: uuid("document_id")
      .unique("invoice_document_id_key")
      .references(() => sourceDocument.id),
    number: text("number").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    dueDateSource: text("due_date_source", {
      enum: DUE_DATE_SOURCES,
    }).notNull(),
    paymentTerms: text("payment_terms"),
    currency: text("currency").notNull(),
    totalCents: integer("total_cents").notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (table) => [
    check(
      "invoice_due_date_source_check",
      oneOf(table.dueDateSource, DUE_DATE_SOURCES)
    ),
    // An unspecified due date is never overdue, so it never carries a date (R-29).
    check(
      "invoice_due_date_check",
      sql`(${table.dueDate} is null) = (${table.dueDateSource} = 'unspecified')`
    ),
    check("invoice_currency_check", currencyCode(table.currency)),
    check("invoice_total_cents_check", sql`${table.totalCents} > 0`),
    index("invoice_customer_number_idx").on(
      table.customerId,
      sql`upper(btrim(${table.number}))`
    ),
  ]
);

export const payment = pgTable(
  "payment",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    documentId: uuid("document_id")
      .unique("payment_document_id_key")
      .references(() => sourceDocument.id),
    paymentDate: date("payment_date").notNull(),
    currency: text("currency").notNull(),
    amountCents: integer("amount_cents").notNull(),
    reference: text("reference"),
    method: text("method"),
    /** Stored trimmed, upper case, distinct and sorted. */
    namedInvoiceNumbers: text("named_invoice_numbers")
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...timestamps(),
  },
  (table) => [
    check("payment_currency_check", currencyCode(table.currency)),
    check("payment_amount_cents_check", sql`${table.amountCents} > 0`),
    index("payment_customer_date_idx").on(table.customerId, table.paymentDate),
  ]
);

export const allocation = pgTable(
  "allocation",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payment.id),
    amountCents: integer("amount_cents").notNull(),
    automatic: boolean("automatic").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique("allocation_invoice_payment_key").on(
      table.invoiceId,
      table.paymentId
    ),
    check("allocation_amount_cents_check", sql`${table.amountCents} > 0`),
    index("allocation_payment_id_idx").on(table.paymentId),
  ]
);

/** Append-only, like `audit_event`, so it holds `occurred_at` only. */
export const allocationEvent = pgTable(
  "allocation_event",
  {
    id: id(),
    /** No foreign key: an unlinked allocation is deleted and its events stay. */
    allocationId: uuid("allocation_id").notNull(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payment.id),
    action: text("action", { enum: ALLOCATION_ACTIONS }).notNull(),
    amountBeforeCents: integer("amount_before_cents").notNull(),
    amountAfterCents: integer("amount_after_cents").notNull(),
    automatic: boolean("automatic").notNull(),
    /** The caller's `user.id`, null without a signed-in caller, by id with no foreign key. */
    actorUserId: text("actor_user_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "allocation_event_action_check",
      oneOf(table.action, ALLOCATION_ACTIONS)
    ),
    check(
      "allocation_event_amount_before_cents_check",
      sql`${table.amountBeforeCents} >= 0`
    ),
    check(
      "allocation_event_amount_after_cents_check",
      sql`${table.amountAfterCents} >= 0`
    ),
    index("allocation_event_invoice_occurred_idx").on(
      table.invoiceId,
      table.occurredAt
    ),
    index("allocation_event_payment_occurred_idx").on(
      table.paymentId,
      table.occurredAt
    ),
  ]
);

export const fieldOrigin = pgTable(
  "field_origin",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => sourceDocument.id),
    field: text("field").notNull(),
    origin: text("origin", { enum: FIELD_ORIGINS }).notNull(),
    quote: text("quote"),
    page: integer("page"),
    ...timestamps(),
  },
  (table) => [
    unique("field_origin_document_field_key").on(table.documentId, table.field),
    check("field_origin_origin_check", oneOf(table.origin, FIELD_ORIGINS)),
    check("field_origin_page_check", sql`${table.page} > 0`),
    // An extracted value always names where it was read (R-24).
    check(
      "field_origin_extracted_check",
      sql`${table.origin} <> 'extracted' or (${table.quote} is not null and ${table.page} is not null)`
    ),
  ]
);

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "__drizzle_migrations_invoices";

/**
 * Every SQL file the journal above names, one `new URL` each. This spelling is what puts the
 * SQL in the image: a production bundler follows a file reference written this way, emits the
 * file beside the server and rewrites the URL to the emitted copy, while a folder path is
 * followed by nothing and copied by nothing. A new migration adds its line here in the same
 * change that generates it, and `migrationsFromJournal` refuses to start if it does not.
 */
const MIGRATION_FILES = {
  "0000_invoice-records": new URL(
    "../drizzle/0000_invoice-records.sql",
    import.meta.url
  ),
  "0001_document-reading": new URL(
    "../drizzle/0001_document-reading.sql",
    import.meta.url
  ),
};

/**
 * This module's migration history, in journal order (R-24).
 *
 * A thunk, not an array: the SQL read is deferred to the first call, because a page's SSR
 * compilation resolves the same SQL URL to a public asset path `readFileSync` cannot open, and
 * a module-scope read would fail that compilation. The `new URL` declarations above stay at
 * module scope on purpose: that spelling is what the bundler traces to copy the SQL into the
 * image, so this thunk defers only the read, never the URL declarations. Called once per
 * history at bootstrap.
 */
export const MIGRATIONS = () => migrationsFromJournal(journal, MIGRATION_FILES);
