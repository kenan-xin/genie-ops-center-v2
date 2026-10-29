import {
  AppError,
  CORE_ERRORS,
  moduleAudit,
  type ModuleRequestContext,
  type TenantTransaction,
} from "@genie/core";
import { and, eq, inArray, sql } from "drizzle-orm";

import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { allocation, allocationEvent, invoice, payment } from "../../schema.ts";

export type LockedInvoice = {
  readonly id: string;
  readonly customerId: string;
  readonly invoiceDate: string;
  readonly number: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly allocatedCents: number;
};

export type LockedPayment = {
  readonly id: string;
  readonly customerId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly allocatedCents: number;
};

const audit = moduleAudit("invoices");

/**
 * The allocated cents per id of `column`. It runs as its own statement after the row lock on
 * purpose: under read committed, a statement reads the snapshot taken when it started, so a sum
 * read in the locking statement itself would miss a link committed while that statement waited.
 */
async function allocatedBy(
  tx: TenantTransaction,
  column: typeof allocation.invoiceId | typeof allocation.paymentId,
  ids: readonly string[]
): Promise<ReadonlyMap<string, number>> {
  const rows = await tx
    .select({
      id: sql<string>`${column}`,
      cents: sql<number>`sum(${allocation.amountCents})::int`,
    })
    .from(allocation)
    .where(inArray(column, [...ids]))
    .groupBy(column);

  return new Map(rows.map((row) => [row.id, row.cents]));
}

/** Locks the invoice rows in id order, the lock order of every write, and reads their allocations. */
export async function lockInvoices(
  tx: TenantTransaction,
  ids: readonly string[]
): Promise<ReadonlyMap<string, LockedInvoice>> {
  if (ids.length === 0) return new Map();

  const rows = await tx
    .select({
      id: invoice.id,
      customerId: invoice.customerId,
      invoiceDate: invoice.invoiceDate,
      number: invoice.number,
      currency: invoice.currency,
      totalCents: invoice.totalCents,
    })
    .from(invoice)
    .where(inArray(invoice.id, [...ids]))
    .orderBy(invoice.id)
    .for("update");

  const allocated = await allocatedBy(tx, allocation.invoiceId, ids);

  return new Map(
    rows.map((row) => [
      row.id,
      { ...row, allocatedCents: allocated.get(row.id) ?? 0 },
    ])
  );
}

/** Locks one payment row and reads its allocations. Taken after the invoice rows. */
export async function lockPayment(
  tx: TenantTransaction,
  id: string
): Promise<LockedPayment | undefined> {
  const [row] = await tx
    .select({
      id: payment.id,
      customerId: payment.customerId,
      currency: payment.currency,
      amountCents: payment.amountCents,
    })
    .from(payment)
    .where(eq(payment.id, id))
    .for("update");

  if (row === undefined) return undefined;

  const allocated = await allocatedBy(tx, allocation.paymentId, [id]);

  return { ...row, allocatedCents: allocated.get(id) ?? 0 };
}

/**
 * Refuses an amount above the invoice's open balance or the payment's unallocated amount. `own`
 * is the link's current amount, which a change frees before it is checked.
 */
function assertWithinBalances(
  locked: { readonly invoice: LockedInvoice; readonly payment: LockedPayment },
  amountCents: number,
  own: number
): void {
  const { invoice: i, payment: p } = locked;

  if (amountCents > i.totalCents - i.allocatedCents + own) {
    throw new AppError(INVOICE_ERRORS["exceeds-invoice-balance"]);
  }

  if (amountCents > p.amountCents - p.allocatedCents + own) {
    throw new AppError(INVOICE_ERRORS["exceeds-payment-balance"]);
  }
}

type LinkChange = {
  readonly allocationId: string;
  readonly invoiceId: string;
  readonly paymentId: string;
  readonly action: "linked" | "changed" | "unlinked";
  readonly beforeCents: number;
  readonly afterCents: number;
  readonly automatic: boolean;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
};

/** The allocation event and the audit row of one change, both on the caller's transaction (R-32). */
async function recordChange(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  change: LinkChange
): Promise<void> {
  await tx.insert(allocationEvent).values({
    allocationId: change.allocationId,
    invoiceId: change.invoiceId,
    paymentId: change.paymentId,
    action: change.action,
    amountBeforeCents: change.beforeCents,
    amountAfterCents: change.afterCents,
    automatic: change.automatic,
    actorUserId: ctx.caller.authenticated ? ctx.caller.userId : null,
  });

  await audit(
    { tenant: ctx.tenant, caller: ctx.caller, tx },
    `invoices:allocation-${change.action}`,
    { type: RECORD_TYPES.invoice, id: change.invoiceId },
    change.summary,
    change.metadata
  );
}

/** Links an amount of a payment to an invoice of the same customer and currency (R-32, R-34). */
export async function linkPayment(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  input: {
    readonly invoiceId: string;
    readonly paymentId: string;
    readonly amountCents: number;
    readonly automatic: boolean;
  }
): Promise<{ readonly allocationId: string }> {
  const lockedInvoice = (await lockInvoices(tx, [input.invoiceId])).get(
    input.invoiceId
  );

  const lockedPayment = await lockPayment(tx, input.paymentId);

  if (lockedInvoice === undefined || lockedPayment === undefined) {
    throw new AppError(CORE_ERRORS["not-found"]);
  }

  if (
    lockedInvoice.customerId !== lockedPayment.customerId ||
    lockedInvoice.currency !== lockedPayment.currency
  ) {
    throw new AppError(INVOICE_ERRORS["link-mismatch"]);
  }

  const [existing] = await tx
    .select({ id: allocation.id })
    .from(allocation)
    .where(
      and(
        eq(allocation.invoiceId, input.invoiceId),
        eq(allocation.paymentId, input.paymentId)
      )
    );

  if (existing !== undefined) {
    throw new AppError(INVOICE_ERRORS["link-exists"]);
  }

  assertWithinBalances(
    { invoice: lockedInvoice, payment: lockedPayment },
    input.amountCents,
    0
  );

  const [created] = await tx
    .insert(allocation)
    .values({
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      automatic: input.automatic,
    })
    .returning({ id: allocation.id });

  if (created === undefined) throw new Error("the link insert returned no row");

  await recordChange(ctx, tx, {
    allocationId: created.id,
    invoiceId: input.invoiceId,
    paymentId: input.paymentId,
    action: "linked",
    beforeCents: 0,
    afterCents: input.amountCents,
    automatic: input.automatic,
    summary: "Linked a payment to an invoice.",
    metadata: {
      paymentId: input.paymentId,
      allocationId: created.id,
      amountCents: input.amountCents,
      automatic: input.automatic,
    },
  });

  return { allocationId: created.id };
}

/** Locks a link's invoice, its payment and then the link itself, in the lock order. */
async function lockLink(tx: TenantTransaction, allocationId: string) {
  const [link] = await tx
    .select({
      invoiceId: allocation.invoiceId,
      paymentId: allocation.paymentId,
    })
    .from(allocation)
    .where(eq(allocation.id, allocationId));

  if (link === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const lockedInvoice = (await lockInvoices(tx, [link.invoiceId])).get(
    link.invoiceId
  );

  const lockedPayment = await lockPayment(tx, link.paymentId);

  const [current] = await tx
    .select({
      amountCents: allocation.amountCents,
      automatic: allocation.automatic,
    })
    .from(allocation)
    .where(eq(allocation.id, allocationId))
    .for("update");

  // The link can be removed by another write while this one waited on the invoice or payment.
  if (
    current === undefined ||
    lockedInvoice === undefined ||
    lockedPayment === undefined
  ) {
    throw new AppError(CORE_ERRORS["not-found"]);
  }

  return {
    invoice: lockedInvoice,
    payment: lockedPayment,
    link: { id: allocationId, ...link, ...current },
  };
}

/** Changes the amount of one link. A changed link is a person's link, so Undo no longer applies. */
export async function changeAllocation(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  input: { readonly allocationId: string; readonly amountCents: number }
): Promise<void> {
  const locked = await lockLink(tx, input.allocationId);
  const { link } = locked;

  assertWithinBalances(locked, input.amountCents, link.amountCents);

  await tx
    .update(allocation)
    .set({
      amountCents: input.amountCents,
      automatic: false,
      updatedAt: sql`now()`,
    })
    .where(eq(allocation.id, link.id));

  await recordChange(ctx, tx, {
    allocationId: link.id,
    invoiceId: link.invoiceId,
    paymentId: link.paymentId,
    action: "changed",
    beforeCents: link.amountCents,
    afterCents: input.amountCents,
    automatic: false,
    summary: "Changed the amount of a link.",
    metadata: {
      paymentId: link.paymentId,
      allocationId: link.id,
      amountBeforeCents: link.amountCents,
      amountCents: input.amountCents,
    },
  });
}

/** Removes one link. Its amount returns to the payment as unallocated, and its events stay. */
export async function unlinkAllocation(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  input: { readonly allocationId: string }
): Promise<{ readonly unlinkedCents: number }> {
  const { link } = await lockLink(tx, input.allocationId);

  await tx.delete(allocation).where(eq(allocation.id, link.id));

  await recordChange(ctx, tx, {
    allocationId: link.id,
    invoiceId: link.invoiceId,
    paymentId: link.paymentId,
    action: "unlinked",
    beforeCents: link.amountCents,
    afterCents: 0,
    automatic: link.automatic,
    summary: "Removed a link.",
    metadata: {
      paymentId: link.paymentId,
      allocationId: link.id,
      amountCents: link.amountCents,
      automatic: link.automatic,
    },
  });

  return { unlinkedCents: link.amountCents };
}
