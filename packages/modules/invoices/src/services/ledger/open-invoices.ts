import {
  AppError,
  can,
  CORE_ERRORS,
  type ModuleRequestContext,
  type TenantContext,
  type TenantTransaction,
} from "@genie/core";
import { and, eq, gt, or, sql } from "drizzle-orm";

import type { OpenInvoiceRow } from "../../contract.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { allocation, invoice } from "../../schema.ts";

/** The lists' cap (czjw.28): one more row is read to know that the list was cut. */
const OPEN_INVOICE_CAP = 1000;

/** Every page of a long open list stops here, so one slow customer cannot hold a read open (czjw.49). */
const OPEN_INVOICE_MAX_PAGES = 20;

// A join, not a correlated subquery: drizzle leaves the columns of a one-table select unqualified,
// so `invoice.id` inside a subquery on `allocation` would read `allocation.id`.
const openCents = sql<number>`(${invoice.totalCents} - coalesce(sum(${allocation.amountCents}), 0))::int`;

/** One page of the open list, from the last row of the page before it, oldest first. */
type OpenPageRow = {
  readonly invoiceId: string;
  readonly number: string;
  readonly invoiceDate: string;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly openCents: number;
};

/** The rows after `key` in `invoiceDate, number, id` order, or every row for the first page. */
function afterKey(key: OpenPageRow | null) {
  if (key === null) return undefined;

  return or(
    gt(invoice.invoiceDate, key.invoiceDate),
    and(
      eq(invoice.invoiceDate, key.invoiceDate),
      or(
        gt(invoice.number, key.number),
        and(eq(invoice.number, key.number), gt(invoice.id, key.invoiceId))
      )
    )
  );
}

/**
 * The customer's invoices in the currency whose total exceeds all their links, oldest first.
 *
 * Every page is read, so the reading job decides on every open invoice, not on the first 1,000
 * (czjw.49). `truncated` says that the read stopped at `OPEN_INVOICE_MAX_PAGES`.
 */
export async function readOpenInvoices(
  db: TenantContext["db"] | TenantTransaction,
  customerId: string,
  currency: string
): Promise<{ readonly rows: OpenInvoiceRow[]; readonly truncated: boolean }> {
  const rows: OpenInvoiceRow[] = [];
  let key: OpenPageRow | null = null;
  let truncated = true;

  for (let page = 0; page < OPEN_INVOICE_MAX_PAGES && truncated; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each page needs the last row of the page before it.
    const found: readonly OpenPageRow[] = await db
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
        and(
          eq(invoice.customerId, customerId),
          eq(invoice.currency, currency),
          afterKey(key)
        )
      )
      .groupBy(invoice.id)
      .having(gt(openCents, 0))
      .orderBy(invoice.invoiceDate, invoice.number, invoice.id)
      .limit(OPEN_INVOICE_CAP + 1);

    rows.push(...found.slice(0, OPEN_INVOICE_CAP));
    truncated = found.length > OPEN_INVOICE_CAP;

    const last: OpenPageRow | undefined = found[OPEN_INVOICE_CAP - 1];

    if (last !== undefined) key = last;
  }

  return { rows, truncated };
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
