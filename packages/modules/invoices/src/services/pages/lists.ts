import { type ModuleRequestContext, queryDataset } from "@genie/core";
import { z } from "zod";

import type {
  InvoiceListRow,
  InvoiceListView,
  PaymentListRow,
  PaymentListView,
} from "../../presentation/views.ts";
import { invoiceStatusOf, paymentStatusOf } from "./status.ts";

/** The fields a list row reads from one `invoices.invoices` row, as the dataset answers them. */
export const listRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  currency: z.string(),
  totalCents: z.number().int(),
  outstandingCents: z.number().int(),
  overdue: z.boolean(),
  daysOverdue: z.number().int().nullable(),
});

export const LIST_ROW_FIELDS = Object.keys(listRow.shape);

/** One list row, its two overdue fields read into its status. */
export function invoiceListRowOf(row: z.infer<typeof listRow>): InvoiceListRow {
  const { overdue: _overdue, daysOverdue: _days, ...value } = row;

  return { ...value, status: invoiceStatusOf(row) };
}

/**
 * The Invoices list as of the reporting date: one `queryDataset` read under `invoices:read`, so a
 * scoped person sees only the customers they may read (DEC-39, R-9, R-36).
 *
 * shortcut: at most 1,000 rows (DATASET_ROW_CAP); page past it with czjw.28
 */
export async function loadInvoiceList(
  ctx: ModuleRequestContext
): Promise<InvoiceListView> {
  const result = await queryDataset(ctx, {
    dataset: "invoices.invoices",
    query: {
      select: LIST_ROW_FIELDS,
      orderBy: [
        { column: "invoiceDate", direction: "desc" },
        { column: "invoiceNumber", direction: "desc" },
      ],
    },
  });

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => invoiceListRowOf(listRow.parse(row))),
    truncated: result.truncated,
  };
}

/** The fields a list row reads from one `invoices.payments` row, as the dataset answers them. */
export const paymentRow = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  customerName: z.string(),
  paymentDate: z.string(),
  method: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  unallocatedCents: z.number().int(),
});

export const PAYMENT_ROW_FIELDS = Object.keys(paymentRow.shape);

/** One payment list row, its unallocated money read into its status. */
export function paymentListRowOf(
  row: z.infer<typeof paymentRow>
): PaymentListRow {
  return { ...row, status: paymentStatusOf(row) };
}

/**
 * The Payments list as of the reporting date: one `queryDataset` read under `invoices:read`, so a
 * scoped person sees only the payments they may read (DEC-39, R-9).
 *
 * shortcut: at most 1,000 rows (DATASET_ROW_CAP); page past it with czjw.28
 */
export async function loadPaymentList(
  ctx: ModuleRequestContext
): Promise<PaymentListView> {
  const result = await queryDataset(ctx, {
    dataset: "invoices.payments",
    query: {
      select: PAYMENT_ROW_FIELDS,
      orderBy: [
        { column: "paymentDate", direction: "desc" },
        { column: "reference", direction: "desc" },
      ],
    },
  });

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => paymentListRowOf(paymentRow.parse(row))),
    truncated: result.truncated,
  };
}
