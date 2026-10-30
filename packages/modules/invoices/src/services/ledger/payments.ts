import {
  AppError,
  can,
  CORE_ERRORS,
  moduleAudit,
  type ModuleRequestContext,
  type TenantTransaction,
  withTransaction,
} from "@genie/core";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  cents,
  currencyCode,
  isoDate,
  recordId,
  type SavePaymentInput,
  type SavePaymentOutput,
} from "../../contract.ts";
import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { allocation, invoice, payment } from "../../schema.ts";
import {
  decidePaymentMatch,
  normalizedInvoiceNumbers,
  type OpenInvoice,
  type PaymentMatch,
} from "../matching/decide.ts";
import { assertCanWrite } from "./access.ts";
import { linkPayment, lockInvoices } from "./allocations.ts";
import {
  authorizeCustomer,
  findCustomerByName,
  lockCustomer,
} from "./customers.ts";
import { assertDocumentKind, factsChecked } from "./documents.ts";

const audit = moduleAudit("invoices");

/** The server path that the S7-08 reading job calls with what it read. Not a procedure (decision 4). */
export const readingPaymentInput = z.strictObject({
  documentId: recordId,
  customerName: z.string().trim().min(1).max(200),
  paymentDate: isoDate,
  currency: currencyCode,
  amountCents: cents,
  reference: z.string().trim().min(1).max(200).nullable(),
  method: z.string().trim().min(1).max(100).nullable(),
  namedInvoiceNumbers: z.array(z.string().trim().min(1).max(64)).max(20),
});

export type ReadingPaymentInput = z.infer<typeof readingPaymentInput>;

export type ReadingPaymentOutcome =
  | {
      readonly outcome: "saved";
      readonly paymentId: string;
      readonly customerId: string;
      readonly allocationId: string;
      readonly invoiceId: string;
      readonly amountCents: number;
    }
  | {
      readonly outcome: "needs-review";
      readonly customerId: string | null;
      readonly match: PaymentMatch;
    }
  | { readonly outcome: "possible-duplicate"; readonly duplicateOf: string }
  | { readonly outcome: "already-saved"; readonly paymentId: string };

type PaymentFields = {
  readonly customerId: string;
  readonly documentId: string | null;
  readonly paymentDate: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly reference: string | null;
  readonly method: string | null;
  readonly namedInvoiceNumbers: readonly string[];
};

const invoiceRef = (id: string) => ({ type: RECORD_TYPES.invoice, id });

async function paymentOfDocument(
  tx: TenantTransaction,
  documentId: string
): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(eq(payment.documentId, documentId));

  return row?.id;
}

/**
 * The Possible duplicate key facts of a payment (decision 6): a saved payment of the customer with
 * the same payment date, amount and currency. Answers the oldest such payment.
 */
async function findPossibleDuplicatePayment(
  tx: TenantTransaction,
  customerId: string,
  facts: Pick<PaymentFields, "paymentDate" | "amountCents" | "currency">
): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.customerId, customerId),
        eq(payment.paymentDate, facts.paymentDate),
        eq(payment.amountCents, facts.amountCents),
        eq(payment.currency, facts.currency)
      )
    )
    .orderBy(payment.createdAt, payment.id)
    .limit(1);

  return row?.id;
}

/** Inserts the payment and its audit row. A row of the same document is refused (R-26). */
async function insertPayment(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  fields: PaymentFields
): Promise<string> {
  const [saved] = await tx
    .insert(payment)
    .values({
      ...fields,
      namedInvoiceNumbers: [
        ...normalizedInvoiceNumbers(fields.namedInvoiceNumbers),
      ],
    })
    .onConflictDoNothing({ target: payment.documentId })
    .returning({ id: payment.id });

  // The race backstop: another save of the same document committed after its check.
  if (saved === undefined) {
    throw new AppError(INVOICE_ERRORS["document-already-saved"]);
  }

  await audit(
    { tenant: ctx.tenant, caller: ctx.caller, tx },
    "invoices:payment-saved",
    { type: RECORD_TYPES.payment, id: saved.id },
    "Saved a payment.",
    {
      customerId: fields.customerId,
      amountCents: fields.amountCents,
      currency: fields.currency,
    }
  );

  return saved.id;
}

/**
 * Saves a payment by hand with the links the person chose (decision 4). It asks before it saves
 * a Possible duplicate of an existing customer's payment, keeps one record per document, and
 * rolls back the whole save when one link is refused.
 */
export async function savePayment(
  ctx: ModuleRequestContext,
  input: SavePaymentInput
): Promise<SavePaymentOutput> {
  await authorizeCustomer(ctx.caller, input.customer);
  await assertCanWrite(
    ctx.caller,
    input.allocations.map((link) => invoiceRef(link.invoiceId))
  );

  return withTransaction(ctx.tenant, async (tx) => {
    if (input.documentId !== null) {
      await assertDocumentKind(tx, input.documentId, ["payment"]);
    }

    const { customerId, created } = await lockCustomer(ctx, tx, input.customer);

    // One record per document outranks the duplicate prompt, so a double click is refused, not asked.
    if (
      input.documentId !== null &&
      (await paymentOfDocument(tx, input.documentId)) !== undefined
    ) {
      throw new AppError(INVOICE_ERRORS["document-already-saved"]);
    }

    if (!created && !input.keepPossibleDuplicate) {
      const duplicateOf = await findPossibleDuplicatePayment(
        tx,
        customerId,
        input
      );

      if (duplicateOf !== undefined) {
        return { outcome: "possible-duplicate", duplicateOf };
      }
    }

    const paymentId = await insertPayment(ctx, tx, { ...input, customerId });

    const allocations: {
      allocationId: string;
      invoiceId: string;
      amountCents: number;
    }[] = [];

    // Invoice id order is the lock order. The new payment row is invisible to other writes until
    // commit, so locking it after the first invoice cannot deadlock.
    for (const link of input.allocations.toSorted((a, b) =>
      a.invoiceId < b.invoiceId ? -1 : 1
    )) {
      // oxlint-disable-next-line no-await-in-loop -- each link sees the payment amount the previous ones used.
      const { allocationId } = await linkPayment(ctx, tx, {
        invoiceId: link.invoiceId,
        paymentId,
        amountCents: link.amountCents,
        automatic: false,
      });

      allocations.push({ allocationId, ...link });
    }

    return { outcome: "saved", paymentId, customerId, allocations };
  });
}

/** The customer's open invoices in the currency, as the matching rules read them. */
async function openInvoices(
  tx: TenantTransaction,
  customerId: string,
  namedNumbers: readonly string[]
): Promise<OpenInvoice[]> {
  const upperNumber = sql<string>`upper(btrim(${invoice.number}))`;

  const named = await tx
    .select({ id: invoice.id })
    .from(invoice)
    .where(
      and(
        eq(invoice.customerId, customerId),
        inArray(upperNumber, [...namedNumbers])
      )
    );

  const namedIds = named.map((row) => row.id);

  const locked = [...(await lockInvoices(tx, namedIds)).values()].map(
    (row) => ({
      invoiceId: row.id,
      number: row.number,
      invoiceDate: row.invoiceDate,
      currency: row.currency,
      openCents: row.totalCents - row.allocatedCents,
    })
  );

  // A plain read: these only become suggestions, which the person confirms under a lock later.
  const others = await tx
    .select({
      invoiceId: invoice.id,
      number: invoice.number,
      invoiceDate: invoice.invoiceDate,
      currency: invoice.currency,
      openCents: sql<number>`(${invoice.totalCents} - coalesce((select sum(${allocation.amountCents}) from ${allocation} where ${allocation.invoiceId} = ${invoice.id}), 0))::int`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.customerId, customerId),
        namedIds.length > 0 ? notInArray(invoice.id, namedIds) : undefined
      )
    );

  return [...locked, ...others];
}

/**
 * Saves a payment from a reading of its document, linked automatically only when R-30 holds.
 * Every other match answers `needs-review` and writes nothing, so the person decides. The S7-08
 * reading job calls it with what it read; nothing creates a customer here.
 */
export async function recordPaymentFromReading(
  ctx: ModuleRequestContext,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the reading job's output; this function is its parsing boundary.
  raw: unknown
): Promise<ReadingPaymentOutcome> {
  const input = readingPaymentInput.parse(raw);

  if (!(await can(ctx.caller, "invoices:write"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  const found = await findCustomerByName(ctx.tenant.db, input.customerName);

  if (found === undefined) {
    return {
      outcome: "needs-review",
      customerId: null,
      match: { kind: "no-match" },
    };
  }

  await assertCanWrite(ctx.caller, [
    { type: RECORD_TYPES.customer, id: found.id },
  ]);

  return withTransaction(ctx.tenant, async (tx) => {
    await assertDocumentKind(tx, input.documentId, ["payment"]);

    const { customerId } = await lockCustomer(ctx, tx, { id: found.id });

    // Read after the customer lock, so a retried job that waited on it sees the first payment.
    const existing = await paymentOfDocument(tx, input.documentId);

    if (existing !== undefined) {
      return { outcome: "already-saved", paymentId: existing };
    }

    const duplicateOf = await findPossibleDuplicatePayment(
      tx,
      customerId,
      input
    );

    if (duplicateOf !== undefined) {
      return { outcome: "possible-duplicate", duplicateOf };
    }

    const namedInvoiceNumbers = normalizedInvoiceNumbers(
      input.namedInvoiceNumbers
    );

    const match = decidePaymentMatch(
      {
        customerId,
        currency: input.currency,
        amountCents: input.amountCents,
        namedInvoiceNumbers,
        factsChecked: await factsChecked(tx, input.documentId),
      },
      await openInvoices(tx, customerId, namedInvoiceNumbers)
    );

    if (match.kind !== "automatic") {
      return { outcome: "needs-review", customerId, match };
    }

    const { customerName: _, ...fields } = input;
    const paymentId = await insertPayment(ctx, tx, { ...fields, customerId });

    const { allocationId } = await linkPayment(ctx, tx, {
      invoiceId: match.invoiceId,
      paymentId,
      amountCents: match.amountCents,
      automatic: true,
    });

    return {
      outcome: "saved",
      paymentId,
      customerId,
      allocationId,
      invoiceId: match.invoiceId,
      amountCents: match.amountCents,
    };
  });
}
