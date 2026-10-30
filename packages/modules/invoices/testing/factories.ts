import { randomBytes, randomUUID } from "node:crypto";

import type { TenantContext } from "@genie/core";

import type { DueDateSource } from "../src/contract.ts";
import {
  allocation,
  customer,
  type DocumentKind,
  fieldOrigin,
  invoice,
  payment,
  type ReadingOutcome,
  type ReadingStatus,
  sourceDocument,
} from "../src/schema.ts";
import { MATCH_FACT_FIELDS } from "../src/services/ledger/documents.ts";
import type { StoredReading } from "../src/services/reading/stored-reading.ts";

export type CustomerRow = typeof customer.$inferSelect;

export type DocumentRow = typeof sourceDocument.$inferSelect;

export type InvoiceRow = typeof invoice.$inferSelect;

export type PaymentRow = typeof payment.$inferSelect;

export type AllocationRow = typeof allocation.$inferSelect;

export type FieldOriginRow = typeof fieldOrigin.$inferSelect;

/**
 * Each factory inserts one real row through the tenant context and answers it, so a test proves
 * the same path the product uses. The module owns the factories for its own tables, and core
 * never imports this file (R-39).
 */
function only<T>(rows: readonly T[]): T {
  const [row] = rows;

  if (row === undefined) throw new Error("the insert returned no row");

  return row;
}

export async function insertCustomer(
  tenant: TenantContext,
  values: { name?: string; email?: string | null } = {}
): Promise<CustomerRow> {
  return only(
    await tenant.db
      .insert(customer)
      .values({
        name: values.name ?? `Customer ${randomUUID()}`,
        email: values.email ?? null,
      })
      .returning()
  );
}

export async function insertDocument(
  tenant: TenantContext,
  values: {
    kind?: DocumentKind | null;
    sha256?: string;
    fileId?: string;
    fileName?: string | null;
    readingStatus?: ReadingStatus;
    readingAttempts?: number;
    readingOutcome?: ReadingOutcome | null;
    reading?: StoredReading | null;
  } = {}
): Promise<DocumentRow> {
  return only(
    await tenant.db
      .insert(sourceDocument)
      .values({
        kind: values.kind === undefined ? "payment" : values.kind,
        sha256: values.sha256 ?? randomBytes(32).toString("hex"),
        fileId: values.fileId ?? randomUUID(),
        fileName: values.fileName ?? null,
        readingStatus: values.readingStatus ?? "read",
        readingAttempts: values.readingAttempts ?? 0,
        readingOutcome: values.readingOutcome ?? null,
        reading: values.reading ?? null,
      })
      .returning()
  );
}

export async function insertInvoice(
  tenant: TenantContext,
  values: {
    customerId: string;
    number?: string;
    invoiceDate?: string;
    dueDate?: string | null;
    dueDateSource?: DueDateSource;
    currency?: string;
    totalCents?: number;
    documentId?: string | null;
  }
): Promise<InvoiceRow> {
  const dueDate = values.dueDate === undefined ? "2026-10-15" : values.dueDate;

  return only(
    await tenant.db
      .insert(invoice)
      .values({
        customerId: values.customerId,
        number: values.number ?? `INV-${randomUUID()}`,
        invoiceDate: values.invoiceDate ?? "2026-10-01",
        dueDate,
        dueDateSource:
          values.dueDateSource ??
          (dueDate === null ? "unspecified" : "document"),
        currency: values.currency ?? "SGD",
        totalCents: values.totalCents ?? 100_000,
        documentId: values.documentId ?? null,
      })
      .returning()
  );
}

export async function insertPayment(
  tenant: TenantContext,
  values: {
    customerId: string;
    paymentDate?: string;
    currency?: string;
    amountCents?: number;
    reference?: string | null;
    namedInvoiceNumbers?: readonly string[];
    documentId?: string | null;
  }
): Promise<PaymentRow> {
  return only(
    await tenant.db
      .insert(payment)
      .values({
        customerId: values.customerId,
        paymentDate: values.paymentDate ?? "2026-10-10",
        currency: values.currency ?? "SGD",
        amountCents: values.amountCents ?? 100_000,
        reference: values.reference ?? null,
        namedInvoiceNumbers: [...(values.namedInvoiceNumbers ?? [])],
        documentId: values.documentId ?? null,
      })
      .returning()
  );
}

export async function insertAllocation(
  tenant: TenantContext,
  values: {
    invoiceId: string;
    paymentId: string;
    amountCents: number;
    automatic?: boolean;
  }
): Promise<AllocationRow> {
  return only(
    await tenant.db
      .insert(allocation)
      .values({
        invoiceId: values.invoiceId,
        paymentId: values.paymentId,
        amountCents: values.amountCents,
        automatic: values.automatic ?? false,
      })
      .returning()
  );
}

/** A payment document whose three match facts passed the quote check, unless its amount was corrected. */
export async function insertPaymentDocument(
  tenant: TenantContext,
  amountOrigin: "extracted" | "corrected" = "extracted"
): Promise<string> {
  const document = await insertDocument(tenant, { kind: "payment" });

  await Promise.all(
    MATCH_FACT_FIELDS.map((field) =>
      insertFieldOrigin(tenant, {
        documentId: document.id,
        field,
        origin: field === "amount" ? amountOrigin : "extracted",
      })
    )
  );

  return document.id;
}

export async function insertFieldOrigin(
  tenant: TenantContext,
  values: {
    documentId: string;
    field: string;
    origin?: "extracted" | "entered" | "corrected";
    quote?: string | null;
    page?: number | null;
  }
): Promise<FieldOriginRow> {
  return only(
    await tenant.db
      .insert(fieldOrigin)
      .values({
        documentId: values.documentId,
        field: values.field,
        origin: values.origin ?? "extracted",
        quote: values.quote === undefined ? "quoted text" : values.quote,
        page: values.page === undefined ? 1 : values.page,
      })
      .returning()
  );
}
