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
import { and, eq, inArray, sql } from "drizzle-orm";

import { INVOICES_PERMISSIONS } from "../src/permissions.ts";
import { invoicesRecordTypes } from "../src/record-types.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  allocationEvent,
  type DocumentKind,
  invoice,
  payment,
  sourceDocument,
} from "../src/schema.ts";
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
};

/** One history PDF, the pack record it backs, and what this deployment already holds of it. */
type Source = {
  readonly kind: Extract<DocumentKind, "invoice" | "payment">;
  readonly packId: string;
  readonly path: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly documentId: string | undefined;
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
      return Object.assign(file, { documentId: undefined, record: undefined });
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

/**
 * Saves `01_History_Datasets/history_seed.json` as the given person would: invoices in invoice
 * date order, then payments in payment date order with the pack's allocations as the chosen links,
 * each on a document that holds its own PDF. A record already saved on its PDF's document is left
 * as it is, so a second run writes nothing and a stopped run resumes (each PDF's SHA-256 is the key).
 */
export async function seedDemoHistory(
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
        .values({ fileId: file.id, sha256: source.sha256, kind: source.kind })
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
  }

  // The save stamps each link event with the run time, but the pack's links happened on the
  // payment date, so the seed dates them at noon in the pack's time zone. `audit_event` is
  // append-only (decision log: audit events are never edited), so its rows keep the run time.
  const linkedAt = sql`(${payment.paymentDate} + time '12:00') at time zone ${seed.metadata.timezone}`;

  await withTransaction(tenant, (tx) =>
    tx
      .update(allocationEvent)
      .set({ occurredAt: linkedAt })
      .from(payment)
      .where(
        and(
          eq(payment.id, allocationEvent.paymentId),
          inArray(payment.id, [...payments.values()]),
          sql`${allocationEvent.occurredAt} is distinct from ${linkedAt}`
        )
      )
  );

  return { plan, ids: { customers, invoices, payments } };
}
