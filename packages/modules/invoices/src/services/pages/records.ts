import {
  AppError,
  can,
  CORE_ERRORS,
  type ModuleRPCContext,
  queryDataset,
  type ResourceRef,
} from "@genie/core";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { DUE_DATE_SOURCES } from "../../contract.ts";
import type {
  AllocationRow,
  InvoiceRecordView,
  PaymentRecordView,
} from "../../presentation/views.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { invoice, payment, sourceDocument } from "../../schema.ts";
import { allocationHistory } from "./history.ts";
import {
  invoiceListRowOf,
  listRow,
  paymentListRowOf,
  paymentRow,
} from "./lists.ts";

/** The record pages' one read check: `invoices:read` on the record itself (DEC-39, P5). */
export async function assertCanReadRecord(
  ctx: ModuleRPCContext,
  ref: ResourceRef
): Promise<void> {
  if (!(await can(ctx.caller, "invoices:read", ref))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }
}

const detailRow = listRow.extend({
  dueDateSource: z.enum(DUE_DATE_SOURCES),
  paymentTerms: z.string().nullable(),
  description: z.string().nullable(),
  allocatedCents: z.number().int(),
});

const paymentDetailRow = paymentRow.extend({
  allocatedCents: z.number().int(),
});

/** One `invoices.allocations` row, as both record pages read it. */
export const allocationRow = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  paymentId: z.string(),
  paymentReference: z.string().nullable(),
  paymentDate: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  automatic: z.boolean(),
});

export const ALLOCATION_FIELDS = Object.keys(allocationRow.shape);

/**
 * The source PDF of a record, as a short-lived link under `invoices:read` on the record, or null
 * when it was entered by hand (DEC-20, P11).
 */
async function documentUrlOf(
  ctx: ModuleRPCContext,
  ref: ResourceRef,
  documentId: string | null
): Promise<string | null> {
  if (documentId === null) return null;

  const [row] = await ctx.tenant.db
    .select({ fileId: sourceDocument.fileId })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  if (row === undefined) return null;

  const link = await ctx.tenant.fileStorage.createLink({
    fileId: row.fileId,
    principal: ctx.caller,
    permission: "invoices:read",
    resource: ref,
  });

  return link.url;
}

/**
 * The invoice record as of the reporting date: its balance and allocations through the datasets,
 * its link history, and its source PDF (R-9, R-36). An invoice the page check found but the
 * dataset does not answer is dated after the reporting date, so it answers the note (P7).
 */
export async function loadInvoiceRecord(
  ctx: ModuleRPCContext,
  id: string
): Promise<InvoiceRecordView> {
  const ref = { type: RECORD_TYPES.invoice, id };

  await assertCanReadRecord(ctx, ref);

  const read = await queryDataset(ctx, {
    dataset: "invoices.invoices",
    query: {
      select: Object.keys(detailRow.shape),
      filters: [{ field: "id", op: "eq", value: id }],
    },
  });

  const [found] = read.rows;

  if (found === undefined) {
    const record = await ctx.caller.recordOf(ref);

    if (record === undefined) throw new AppError(CORE_ERRORS["not-found"]);

    return {
      kind: "after-reporting-date",
      asOf: read.asOf,
      label: record.label,
    };
  }

  const detail = detailRow.parse(found);

  const [allocations, history, own, branding] = await Promise.all([
    queryDataset(ctx, {
      dataset: "invoices.allocations",
      query: {
        select: ALLOCATION_FIELDS,
        filters: [{ field: "invoiceId", op: "eq", value: id }],
        orderBy: [{ column: "paymentDate", direction: "asc" }],
      },
    }),
    allocationHistory(ctx, { invoiceId: id }, read.asOf),
    ctx.tenant.db
      .select({ documentId: invoice.documentId })
      .from(invoice)
      .where(eq(invoice.id, id)),
    ctx.tenant.branding.get(),
  ]);

  return {
    kind: "shown",
    asOf: read.asOf,
    timeZone: branding.defaultTimeZone,
    invoice: {
      ...invoiceListRowOf(detail),
      dueDateSource: detail.dueDateSource,
      paymentTerms: detail.paymentTerms,
      description: detail.description,
      allocatedCents: detail.allocatedCents,
    },
    allocations: allocations.rows.map((row): AllocationRow =>
      allocationRow.parse(row)
    ),
    history,
    documentUrl: await documentUrlOf(ctx, ref, own[0]?.documentId ?? null),
  };
}

/**
 * The payment record as of the reporting date: its amount, unallocated money and links through the
 * datasets, its link history, and its source PDF (R-9, R-36). A payment the page check found but
 * the dataset does not answer is dated after the reporting date, so it answers the note (P7).
 */
export async function loadPaymentRecord(
  ctx: ModuleRPCContext,
  id: string
): Promise<PaymentRecordView> {
  const ref = { type: RECORD_TYPES.payment, id };

  await assertCanReadRecord(ctx, ref);

  const read = await queryDataset(ctx, {
    dataset: "invoices.payments",
    query: {
      select: Object.keys(paymentDetailRow.shape),
      filters: [{ field: "id", op: "eq", value: id }],
    },
  });

  const [found] = read.rows;

  if (found === undefined) {
    const record = await ctx.caller.recordOf(ref);

    if (record === undefined) throw new AppError(CORE_ERRORS["not-found"]);

    return {
      kind: "after-reporting-date",
      asOf: read.asOf,
      label: record.label,
    };
  }

  const detail = paymentDetailRow.parse(found);

  const [allocations, history, own, branding] = await Promise.all([
    queryDataset(ctx, {
      dataset: "invoices.allocations",
      query: {
        select: ALLOCATION_FIELDS,
        filters: [{ field: "paymentId", op: "eq", value: id }],
        orderBy: [{ column: "invoiceNumber", direction: "asc" }],
      },
    }),
    allocationHistory(ctx, { paymentId: id }, read.asOf),
    ctx.tenant.db
      .select({ documentId: payment.documentId })
      .from(payment)
      .where(eq(payment.id, id)),
    ctx.tenant.branding.get(),
  ]);

  return {
    kind: "shown",
    asOf: read.asOf,
    timeZone: branding.defaultTimeZone,
    payment: {
      ...paymentListRowOf(detail),
      allocatedCents: detail.allocatedCents,
    },
    allocations: allocations.rows.map((row): AllocationRow =>
      allocationRow.parse(row)
    ),
    history,
    documentUrl: await documentUrlOf(ctx, ref, own[0]?.documentId ?? null),
  };
}
