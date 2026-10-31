import {
  AppError,
  can,
  CORE_ERRORS,
  type ModuleRequestContext,
  type TenantContext,
  type TenantTransaction,
} from "@genie/core";
import { and, eq, gt, sql } from "drizzle-orm";

import type { OpenInvoiceRow } from "../../contract.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { allocation, invoice } from "../../schema.ts";

/** The lists' cap (czjw.28): one more row is read to know that the list was cut. */
const OPEN_INVOICE_CAP = 1000;

// A join, not a correlated subquery: drizzle leaves the columns of a one-table select unqualified,
// so `invoice.id` inside a subquery on `allocation` would read `allocation.id`.
const openCents = sql<number>`(${invoice.totalCents} - coalesce(sum(${allocation.amountCents}), 0))::int`;

/**
 * The customer's invoices in the currency whose total exceeds all their links, oldest first, at
 * most 1,000.
 *
 * shortcut: at most 1,000 rows; page past it with czjw.28
 */
export async function readOpenInvoices(
  db: TenantContext["db"] | TenantTransaction,
  customerId: string,
  currency: string
): Promise<{ readonly rows: OpenInvoiceRow[]; readonly truncated: boolean }> {
  const rows = await db
    .select({
      invoiceId: invoice.id,
      number: invoice.number,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      openCents,
    })
    .from(invoice)
    .leftJoin(allocation, eq(allocation.invoiceId, invoice.id))
    .where(
      and(eq(invoice.customerId, customerId), eq(invoice.currency, currency))
    )
    .groupBy(invoice.id)
    .having(gt(openCents, 0))
    .orderBy(invoice.invoiceDate, invoice.number, invoice.id)
    .limit(OPEN_INVOICE_CAP + 1);

  return {
    rows: rows.slice(0, OPEN_INVOICE_CAP),
    truncated: rows.length > OPEN_INVOICE_CAP,
  };
}

/** `readOpenInvoices` for a reader of the customer (`invoices:read` on it, else `forbidden`). */
export async function listOpenInvoices(
  ctx: ModuleRequestContext,
  input: { readonly customerId: string; readonly currency: string }
): Promise<{ readonly rows: OpenInvoiceRow[]; readonly truncated: boolean }> {
  if (
    !(await can(ctx.caller, "invoices:read", {
      type: RECORD_TYPES.customer,
      id: input.customerId,
    }))
  ) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return readOpenInvoices(ctx.tenant.db, input.customerId, input.currency);
}
