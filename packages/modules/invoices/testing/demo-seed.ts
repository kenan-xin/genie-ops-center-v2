import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import {
  callProcedure,
  principalFor,
  type TenantContext,
  withTransaction,
} from "@genie/core";
import { DemoSeedRefused } from "@genie/core/testing";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { INVOICES_PERMISSIONS } from "../src/permissions.ts";
import { invoicesRecordTypes } from "../src/record-types.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  allocationEvent,
  type DocumentKind,
  fieldOrigin,
  invoice,
  payment,
  sourceDocument,
} from "../src/schema.ts";
import type { ModelReading } from "../src/services/reading/model-output.ts";
import { extractedOrigins } from "../src/services/reading/origin-rows.ts";
import {
  centsText,
  checkReading,
} from "../src/services/reading/quote-check.ts";
import { extractTextLayer } from "../src/services/reading/text-layer.ts";
import {
  DEMO_PACK,
  type DemoHistoryIds,
  readDemoJson,
  toCents,
} from "./demo-pack.ts";

type SeedCustomer = {
  readonly customer_id: string;
  readonly company_name: string;
  readonly email: string | null;
};

type SeedInvoice = {
  readonly invoice_id: string;
  readonly customer_id: string;
  readonly invoice_date: string;
  readonly document_due_date: string | null;
  readonly due_date: string | null;
  readonly due_date_source: "document" | "user" | "unspecified";
  readonly payment_terms: string | null;
  readonly currency: string;
  readonly total_amount: number;
  readonly description: string | null;
  readonly source_pdf: string;
};

type SeedPayment = {
  readonly payment_id: string;
  readonly customer_id: string;
  readonly payment_date: string;
  readonly currency: string;
  readonly amount: number;
  readonly payment_reference: string | null;
  readonly method: string | null;
  readonly source_pdf: string;
};

type SeedAllocation = {
  readonly payment_id: string;
  readonly invoice_id: string;
  readonly allocated_amount: number;
};

type Seed = {
  readonly metadata: { readonly as_of_date: string; readonly timezone: string };
  readonly customers: readonly SeedCustomer[];
  readonly invoices: readonly SeedInvoice[];
  readonly payments: readonly SeedPayment[];
  readonly payment_allocations: readonly SeedAllocation[];
};

export type DemoHistoryCount = {
  readonly toWrite: number;
  readonly present: number;
};

export type DemoHistoryPlan = {
  readonly documents: DemoHistoryCount;
  readonly invoices: DemoHistoryCount;
  readonly payments: DemoHistoryCount;
  /** The checked readings of the history PDFs, which the record pages pin (R-38a). */
  readonly readings: DemoHistoryCount;
};

/** One history PDF, the pack record it backs, and what this deployment already holds of it. */
type Source = {
  readonly kind: Extract<DocumentKind, "invoice" | "payment">;
  readonly packId: string;
  readonly path: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly documentId: string | undefined;
  readonly hasReading: boolean;
  readonly record:
    | { readonly id: string; readonly customerId: string }
    | undefined;
};

// SAFETY: the pack's history file is read verbatim and this loader owns its shape.
const readSeed = () =>
  readDemoJson("01_History_Datasets/history_seed.json") as Seed;

/** The pack's `metadata.as_of_date`, "2026-10-27". */
export function demoReportingDate(): string {
  return readSeed().metadata.as_of_date;
}

function count(sources: readonly Source[]): DemoHistoryCount {
  const present = sources.filter((source) => source.record).length;

  return { toWrite: sources.length - present, present };
}

/**
 * Reads and hashes every history PDF before it reads the database, so a missing file fails before
 * any write, then refuses a deployment the seed cannot write to and finds what it already holds.
 */
async function readSources(
  tenant: TenantContext,
  seed: Seed
): Promise<{ readonly plan: DemoHistoryPlan; readonly sources: Source[] }> {
  const files = [
    ...seed.invoices.map((record) => ({
      kind: "invoice" as const,
      packId: record.invoice_id,
      path: record.source_pdf,
    })),
    ...seed.payments.map((record) => ({
      kind: "payment" as const,
      packId: record.payment_id,
      path: record.source_pdf,
    })),
  ].map(({ kind, packId, path }) => {
    const bytes = readFileSync(new URL(path, DEMO_PACK));
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    return { kind, packId, path, bytes, sha256 };
  });

  const {
    rows: [table],
  } = await tenant.db.execute<{ table: string | null }>(
    sql`select to_regclass('public.invoice')::text as table`
  );

  if (table?.table == null) {
    throw new DemoSeedRefused(
      "the invoices tables do not exist on this database. Start the app on it once, so that it applies the module migrations, then run the seed again."
    );
  }

  if (!(await tenant.entitlements.isEnabled("invoices"))) {
    throw new DemoSeedRefused(
      "Invoices and Payments is switched off on this deployment. An administrator switches it on in Admin > Modules, then you run the seed again."
    );
  }

  const documents = await tenant.db
    .select({
      id: sourceDocument.id,
      sha256: sourceDocument.sha256,
      kind: sourceDocument.kind,
      hasReading: sql<boolean>`${sourceDocument.reading} is not null`,
      invoiceId: invoice.id,
      invoiceCustomerId: invoice.customerId,
      paymentId: payment.id,
      paymentCustomerId: payment.customerId,
    })
    .from(sourceDocument)
    .leftJoin(invoice, eq(invoice.documentId, sourceDocument.id))
    .leftJoin(payment, eq(payment.documentId, sourceDocument.id))
    .where(
      inArray(
        sourceDocument.sha256,
        files.map((file) => file.sha256)
      )
    );

  const byHash = new Map(documents.map((row) => [row.sha256, row]));

  const sources = files.map((file): Source => {
    const document = byHash.get(file.sha256);

    if (document === undefined) {
      return Object.assign(file, {
        documentId: undefined,
        hasReading: false,
        record: undefined,
      });
    }

    if (document.kind !== file.kind) {
      throw new DemoSeedRefused(
        `the demo PDF ${file.path} is already stored as a ${document.kind} document on this deployment, so the seed cannot save its ${file.kind} on it.`
      );
    }

    const id = document.invoiceId ?? document.paymentId;

    const customerId = document.invoiceCustomerId ?? document.paymentCustomerId;

    return Object.assign(file, {
      documentId: document.id,
      hasReading: document.hasReading,
      record:
        id === null || customerId === null ? undefined : { id, customerId },
    });
  });

  return {
    plan: {
      documents: {
        toWrite: sources.filter((source) => !source.documentId).length,
        present: sources.filter((source) => source.documentId).length,
      },
      invoices: count(sources.filter((source) => source.kind === "invoice")),
      payments: count(sources.filter((source) => source.kind === "payment")),
      readings: {
        toWrite: sources.filter((source) => !source.hasReading).length,
        present: sources.filter((source) => source.hasReading).length,
      },
    },
    sources,
  };
}

/** What a seed run would write, and what this deployment already holds. Writes nothing. */
export async function planDemoHistory(
  tenant: TenantContext
): Promise<DemoHistoryPlan> {
  return (await readSources(tenant, readSeed())).plan;
}

function saved<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const value = map.get(key);

  if (value === undefined) {
    throw new Error(`The demo history saved no ${what} ${String(key)}.`);
  }

  return value;
}

/** The invoices tables whose `id` the seed fixes; each defaults to `gen_random_uuid()`. */
const FIXED_ID_TABLES = [
  "customer",
  "document",
  "invoice",
  "payment",
  "allocation",
  "allocation_event",
  "field_origin",
] as const;

/**
 * Saves `01_History_Datasets/history_seed.json` as the given person would: invoices in invoice
 * date order, then payments in payment date order with the pack's allocations as the chosen links,
 * each on a document that holds its own PDF. A record already saved on its PDF's document is left
 * as it is, so a second run writes nothing and a stopped run resumes (each PDF's SHA-256 is the key).
 *
 * The rows get ids from one counter, so a fresh database always gets the same ids and a recorded
 * model request that holds a record id replays (bead xok3.39). The counter stays, so a resumed run
 * never reuses an id. The `gen_random_uuid()` defaults come back after the run.
 */
export async function seedDemoHistory(
  tenant: TenantContext,
  input: { readonly userId: string }
): Promise<{ readonly plan: DemoHistoryPlan; readonly ids: DemoHistoryIds }> {
  const setDefaults = (value: string) =>
    tenant.db.execute(
      sql.raw(
        FIXED_ID_TABLES.map(
          (table) =>
            `alter table "${table}" alter column id set default ${value}`
        ).join("; ")
      )
    );

  await tenant.db.execute(
    sql`create sequence if not exists invoices_demo_seed_id`
  );
  // The version and variant digits make it a valid version 4 UUID, which zod requires.
  await setDefaults(
    "overlay(overlay(md5('genie-demo-' || nextval('invoices_demo_seed_id')) placing '4' from 13) placing '8' from 17)::uuid"
  );

  try {
    return await saveDemoHistory(tenant, input);
  } finally {
    await setDefaults("gen_random_uuid()");
  }
}

async function saveDemoHistory(
  tenant: TenantContext,
  input: { readonly userId: string }
): Promise<{ readonly plan: DemoHistoryPlan; readonly ids: DemoHistoryIds }> {
  const seed = readSeed();
  const { plan, sources } = await readSources(tenant, seed);

  const procedures = callProcedure(invoicesRouter, {
    tenant,
    caller: principalFor({
      tenant,
      modules: [
        { permissions: INVOICES_PERMISSIONS, recordTypes: invoicesRecordTypes },
      ],
      userId: input.userId,
      authenticated: true,
    }),
  });

  const sourceOf = new Map(
    sources.map((source) => [`${source.kind}:${source.packId}`, source])
  );

  const customers = new Map<string, string>();
  const invoices = new Map<string, string>();
  const payments = new Map<string, string>();
  const savedPayments: string[] = [];

  const seedCustomers = new Map(
    seed.customers.map((customer) => [customer.customer_id, customer])
  );

  /** The document of a source without a record: the stored one, or a new one with its PDF. */
  async function documentOf(source: Source): Promise<string> {
    if (source.documentId !== undefined) return source.documentId;

    return withTransaction(tenant, async (tx) => {
      const file = await tenant.fileStorage.store(
        {
          fileName: basename(source.path),
          mimeType: "application/pdf",
          bytes: source.bytes,
          uploadedByUserId: input.userId,
        },
        tx
      );

      const [document] = await tx
        .insert(sourceDocument)
        .values({
          fileId: file.id,
          sha256: source.sha256,
          kind: source.kind,
          fileName: basename(source.path),
        })
        .returning({ id: sourceDocument.id });

      if (document === undefined) {
        throw new Error(`The demo PDF ${source.path} got no document row.`);
      }

      return document.id;
    });
  }

  function customerOf(customerId: string) {
    const customer = saved(seedCustomers, customerId, "customer");

    return {
      name: customer.company_name,
      email: customer.email,
      confirmed: true as const,
    };
  }

  for (const record of seed.invoices.toSorted((left, right) =>
    left.invoice_date.localeCompare(right.invoice_date)
  )) {
    const source = saved(sourceOf, `invoice:${record.invoice_id}`, "source");

    if (source.record !== undefined) {
      customers.set(record.customer_id, source.record.customerId);
      invoices.set(record.invoice_id, source.record.id);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- the saves run in date order, one transaction each.
    const result = await procedures.saveInvoice({
      // oxlint-disable-next-line no-await-in-loop -- the document comes before its record.
      documentId: await documentOf(source),
      customer: customerOf(record.customer_id),
      number: record.invoice_id,
      invoiceDate: record.invoice_date,
      dueDate: record.due_date,
      dueDateSource:
        record.due_date_source === "user" ? "person" : record.due_date_source,
      paymentTerms: record.payment_terms,
      currency: record.currency,
      totalCents: toCents(record.total_amount),
      description: record.description,
      // The pack repeats no number of a customer; a duplicated save would break the figures.
      keepPossibleDuplicate: false,
    });

    if (result.outcome !== "saved") {
      throw new Error(
        `The demo invoice ${record.invoice_id} answered ${result.outcome}.`
      );
    }

    customers.set(record.customer_id, result.customerId);
    invoices.set(record.invoice_id, result.invoiceId);
  }

  for (const record of seed.payments.toSorted((left, right) =>
    left.payment_date.localeCompare(right.payment_date)
  )) {
    const source = saved(sourceOf, `payment:${record.payment_id}`, "source");

    if (source.record !== undefined) {
      customers.set(record.customer_id, source.record.customerId);
      payments.set(record.payment_id, source.record.id);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- the saves run in date order, one transaction each.
    const result = await procedures.savePayment({
      // oxlint-disable-next-line no-await-in-loop -- the document comes before its record.
      documentId: await documentOf(source),
      customer: customerOf(record.customer_id),
      paymentDate: record.payment_date,
      currency: record.currency,
      amountCents: toCents(record.amount),
      reference: record.payment_reference,
      method: record.method,
      // The pack holds no named numbers; its allocations are the links the person chose.
      namedInvoiceNumbers: [],
      allocations: seed.payment_allocations
        .filter((allocation) => allocation.payment_id === record.payment_id)
        .map((allocation) => ({
          invoiceId: saved(invoices, allocation.invoice_id, "invoice"),
          amountCents: toCents(allocation.allocated_amount),
        })),
      keepPossibleDuplicate: false,
    });

    if (result.outcome !== "saved") {
      throw new Error(
        `The demo payment ${record.payment_id} answered ${result.outcome}.`
      );
    }

    customers.set(record.customer_id, result.customerId);
    payments.set(record.payment_id, result.paymentId);
    savedPayments.push(result.paymentId);
  }

  // The save stamps each link event with the run time, but the pack's links happened on the
  // payment date, so the seed dates them at noon in the pack's time zone. Only the links of
  // payments saved by this run, so a later run never re-dates a person's own history.
  // `audit_event` is append-only (decision log: never edited), so its rows keep the run time.
  await withTransaction(tenant, (tx) =>
    tx
      .update(allocationEvent)
      .set({
        occurredAt: sql`(${payment.paymentDate} + time '12:00') at time zone ${seed.metadata.timezone}`,
      })
      .from(payment)
      .where(
        and(
          eq(payment.id, allocationEvent.paymentId),
          inArray(payment.id, savedPayments),
          eq(allocationEvent.action, "linked")
        )
      )
  );

  await storeHistoryReadings(tenant, seed, sources);

  return { plan, ids: { customers, invoices, payments } };
}

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Every history PDF has one page. */
const quoted = (value: string, quote = value) => ({ value, quote, page: 1 });

/**
 * The reading a model gives for a history PDF: the pack's values, each quoted with the label the
 * PDF prints beside it, so a date never marks the invoice number line that holds the same date.
 */
function historyReadingOf(source: Source, seed: Seed): ModelReading {
  const none = {
    number: null,
    dueDate: null,
    paymentTerms: null,
    reference: null,
    method: null,
    description: null,
    invoiceNumbers: [],
  };

  const amountOf = (total: number, currency: string) => ({
    amount: quoted(
      centsText(toCents(total)),
      `TOTAL (${currency}) ${MONEY.format(total)}`
    ),
    currency: quoted(currency, `Currency: ${currency}`),
  });

  const nameOf = (customerId: string) =>
    saved(
      new Map(seed.customers.map((row) => [row.customer_id, row])),
      customerId,
      "customer"
    ).company_name;

  if (source.kind === "invoice") {
    const record = saved(
      new Map(seed.invoices.map((row) => [row.invoice_id, row])),
      source.packId,
      "invoice"
    );

    const customer = nameOf(record.customer_id);

    return {
      ...none,
      kind: "invoice",
      customer: quoted(customer, `Bill to: ${customer}`),
      number: quoted(record.invoice_id, `Invoice number ${record.invoice_id}`),
      date: quoted(record.invoice_date, `Invoice date ${record.invoice_date}`),
      dueDate:
        record.document_due_date === null
          ? null
          : quoted(
              record.document_due_date,
              `Payment due date ${record.document_due_date}`
            ),
      description:
        record.description === null ? null : quoted(record.description),
      paymentTerms:
        record.payment_terms === null ? null : quoted(record.payment_terms),
      ...amountOf(record.total_amount, record.currency),
    };
  }

  const record = saved(
    new Map(seed.payments.map((row) => [row.payment_id, row])),
    source.packId,
    "payment"
  );

  return {
    ...none,
    kind: "payment",
    customer: quoted(nameOf(record.customer_id)),
    date: quoted(record.payment_date, `Payment date ${record.payment_date}`),
    reference:
      record.payment_reference === null
        ? null
        : quoted(
            record.payment_reference,
            `Payment reference ${record.payment_reference}`
          ),
    method:
      record.method === null
        ? null
        : quoted(record.method, `Payment method ${record.method}`),
    invoiceNumbers: seed.payment_allocations
      .filter((allocation) => allocation.payment_id === record.payment_id)
      .map((allocation) =>
        quoted(
          allocation.invoice_id,
          `Invoice reference ${allocation.invoice_id}`
        )
      ),
    ...amountOf(record.amount, record.currency),
  };
}

/**
 * Stores a checked reading, with its `extracted` origins, on every history document that has
 * none (R-38a). It runs after every record, so the origin rows draw the last ids and every record
 * keeps its id (xok3.39, DEC-55). `updated_at` stays, so the inbox order does not move.
 */
async function storeHistoryReadings(
  tenant: TenantContext,
  seed: Seed,
  sources: readonly Source[]
): Promise<void> {
  const unread = await tenant.db
    .select({ id: sourceDocument.id, sha256: sourceDocument.sha256 })
    .from(sourceDocument)
    .where(
      and(
        isNull(sourceDocument.reading),
        inArray(
          sourceDocument.sha256,
          sources.map((source) => source.sha256)
        )
      )
    )
    // The origin rows draw their ids in this order, so a fresh database always gets the same ones.
    .orderBy(sourceDocument.id);

  const bySha = new Map(sources.map((source) => [source.sha256, source]));

  for (const document of unread) {
    const source = saved(bySha, document.sha256, "source");

    // oxlint-disable-next-line no-await-in-loop -- one PDF at a time keeps the memory flat.
    const { pages } = await extractTextLayer(source.bytes);
    const reading = checkReading(historyReadingOf(source, seed), pages);

    // oxlint-disable-next-line no-await-in-loop -- one transaction per document, in turn.
    await withTransaction(tenant, async (tx) => {
      const [stored] = await tx
        .update(sourceDocument)
        .set({ reading })
        .where(
          and(
            eq(sourceDocument.id, document.id),
            isNull(sourceDocument.reading)
          )
        )
        .returning({ id: sourceDocument.id });

      if (stored === undefined) return;

      await tx
        .insert(fieldOrigin)
        .values(extractedOrigins(document.id, reading))
        .onConflictDoNothing();
    });
  }
}
