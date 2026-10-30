import type { TenantContext } from "@genie/core";
import { and, asc, eq, lte, sql } from "drizzle-orm";

import type { HistoryRow } from "../../presentation/views.ts";
import { allocationEvent, invoice, payment } from "../../schema.ts";

/**
 * Every change of the links of one invoice or one payment, oldest first. It reads the module's own
 * append-only events, so a removed link keeps its history. Only links whose payment and invoice are
 * dated on or before `asOf` count, as in `invoices.allocations` (R-9); `occurred_at` is not cut, because a
 * seed writes past events later. The caller has already checked `invoices:read` on the record.
 */
export async function allocationHistory(
  tenant: TenantContext,
  of: { readonly invoiceId: string } | { readonly paymentId: string },
  asOf: string
): Promise<readonly HistoryRow[]> {
  return tenant.db
    .select({
      id: allocationEvent.id,
      action: allocationEvent.action,
      // ISO 8601 with its offset, whatever the session's time zone.
      occurredAt: sql<string>`to_json(${allocationEvent.occurredAt}) #>> '{}'`,
      amountBeforeCents: allocationEvent.amountBeforeCents,
      amountAfterCents: allocationEvent.amountAfterCents,
      automatic: allocationEvent.automatic,
      invoiceId: allocationEvent.invoiceId,
      invoiceNumber: invoice.number,
      paymentId: allocationEvent.paymentId,
      paymentReference: payment.reference,
      paymentDate: payment.paymentDate,
      currency: invoice.currency,
    })
    .from(allocationEvent)
    .innerJoin(invoice, eq(invoice.id, allocationEvent.invoiceId))
    .innerJoin(payment, eq(payment.id, allocationEvent.paymentId))
    .where(
      and(
        "invoiceId" in of
          ? eq(allocationEvent.invoiceId, of.invoiceId)
          : eq(allocationEvent.paymentId, of.paymentId),
        lte(payment.paymentDate, asOf),
        lte(invoice.invoiceDate, asOf)
      )
    )
    .orderBy(asc(allocationEvent.occurredAt), asc(allocationEvent.id));
}
