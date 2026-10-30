import {
  AppError,
  moduleAudit,
  type ModuleRequestContext,
  type TenantTransaction,
  withTransaction,
} from "@genie/core";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";

import type { SaveInvoiceInput, SaveInvoiceOutput } from "../../contract.ts";
import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { allocation, invoice, payment } from "../../schema.ts";
import {
  decidePaymentMatch,
  normalizeInvoiceNumber,
} from "../matching/decide.ts";
import { linkPayment } from "./allocations.ts";
import { authorizeCustomer, lockCustomer } from "./customers.ts";
import { assertDocumentKind, factsCheckedSql } from "./documents.ts";

const audit = moduleAudit("invoices");

type LinkedPayment = {
  readonly paymentId: string;
  readonly allocationId: string;
  readonly amountCents: number;
};

/**
 * The Possible duplicate key facts of an invoice (decision 6): an invoice of the same customer
 * with the same number, ignoring case and outer spaces. Answers the oldest such invoice.
 */
export async function findPossibleDuplicateInvoice(
  tx: TenantTransaction,
  customerId: string,
  number: string
): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: invoice.id })
    .from(invoice)
    .where(
      and(
        eq(invoice.customerId, customerId),
        sql`upper(btrim(${invoice.number})) = ${normalizeInvoiceNumber(number)}`
      )
    )
    .orderBy(invoice.invoiceDate, invoice.id)
    .limit(1);

  return row?.id;
}

/**
 * R-31: the saved invoice gets the customer's unallocated payments that name it alone, in its
 * currency, with their facts checked, oldest first. Each links only on R-30's `automatic` answer
 * against the open amount that remains.
 */
async function linkPaymentsNamingInvoice(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  saved: {
    readonly invoiceId: string;
    readonly customerId: string;
    readonly number: string;
    readonly invoiceDate: string;
    readonly currency: string;
    readonly totalCents: number;
  }
): Promise<LinkedPayment[]> {
  const candidates = await tx
    .select({
      id: payment.id,
      currency: payment.currency,
      amountCents: payment.amountCents,
      namedInvoiceNumbers: payment.namedInvoiceNumbers,
    })
    .from(payment)
    .where(
      and(
        eq(payment.customerId, saved.customerId),
        eq(payment.currency, saved.currency),
        sql`${payment.namedInvoiceNumbers} = array[${normalizeInvoiceNumber(saved.number)}]::text[]`,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(allocation)
            .where(eq(allocation.paymentId, payment.id))
        ),
        factsCheckedSql(payment.documentId)
      )
    )
    .orderBy(payment.paymentDate, payment.id)
    .for("update");

  if (candidates.length === 0) return [];

  // Read after the lock, in its own statement: a link committed while the lock waited is not in
  // the locking statement's snapshot.
  const allocated = new Set(
    (
      await tx
        .select({ paymentId: allocation.paymentId })
        .from(allocation)
        .where(
          inArray(
            allocation.paymentId,
            candidates.map((candidate) => candidate.id)
          )
        )
    ).map((row) => row.paymentId)
  );

  let openCents = saved.totalCents;
  const linked: LinkedPayment[] = [];

  for (const candidate of candidates) {
    if (allocated.has(candidate.id)) continue;

    const match = decidePaymentMatch(
      {
        customerId: saved.customerId,
        currency: candidate.currency,
        amountCents: candidate.amountCents,
        namedInvoiceNumbers: candidate.namedInvoiceNumbers,
        factsChecked: true,
      },
      [
        {
          invoiceId: saved.invoiceId,
          number: saved.number,
          invoiceDate: saved.invoiceDate,
          currency: saved.currency,
          openCents,
        },
      ]
    );

    if (match.kind !== "automatic") continue;

    // oxlint-disable-next-line no-await-in-loop -- each link lowers the open amount the next one sees.
    const { allocationId } = await linkPayment(ctx, tx, {
      invoiceId: saved.invoiceId,
      paymentId: candidate.id,
      amountCents: match.amountCents,
      automatic: true,
    });

    openCents -= match.amountCents;
    linked.push({
      paymentId: candidate.id,
      allocationId,
      amountCents: match.amountCents,
    });
  }

  return linked;
}

/**
 * Saves an invoice as unpaid (R-29). It asks before it saves a Possible duplicate of an existing
 * customer's invoice, keeps one record per document, and then runs R-31.
 */
export async function saveInvoice(
  ctx: ModuleRequestContext,
  input: SaveInvoiceInput
): Promise<SaveInvoiceOutput> {
  await authorizeCustomer(ctx.caller, input.customer);

  return withTransaction(ctx.tenant, async (tx) => {
    if (input.documentId !== null) {
      await assertDocumentKind(tx, input.documentId, ["invoice"]);
    }

    const { customerId, created } = await lockCustomer(ctx, tx, input.customer);

    // One record per document outranks the duplicate prompt, so a double click is refused, not asked.
    if (input.documentId !== null) {
      const [existing] = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(eq(invoice.documentId, input.documentId));

      if (existing !== undefined) {
        throw new AppError(INVOICE_ERRORS["document-already-saved"]);
      }
    }

    if (!created && !input.keepPossibleDuplicate) {
      const duplicateOf = await findPossibleDuplicateInvoice(
        tx,
        customerId,
        input.number
      );

      if (duplicateOf !== undefined) {
        return { outcome: "possible-duplicate", duplicateOf };
      }
    }

    const [saved] = await tx
      .insert(invoice)
      .values({
        customerId,
        documentId: input.documentId,
        number: input.number,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        dueDateSource: input.dueDateSource,
        paymentTerms: input.paymentTerms,
        currency: input.currency,
        totalCents: input.totalCents,
        description: input.description,
      })
      .onConflictDoNothing({ target: invoice.documentId })
      .returning({ id: invoice.id });

    // The race backstop: another save of the same document committed after the check above.
    if (saved === undefined) {
      throw new AppError(INVOICE_ERRORS["document-already-saved"]);
    }

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "invoices:invoice-saved",
      { type: RECORD_TYPES.invoice, id: saved.id },
      "Saved an invoice.",
      {
        customerId,
        totalCents: input.totalCents,
        currency: input.currency,
        dueDateSource: input.dueDateSource,
      }
    );

    const linkedPayments = await linkPaymentsNamingInvoice(ctx, tx, {
      invoiceId: saved.id,
      customerId,
      number: input.number,
      invoiceDate: input.invoiceDate,
      currency: input.currency,
      totalCents: input.totalCents,
    });

    return {
      outcome: "saved",
      invoiceId: saved.id,
      customerId,
      linkedPayments,
    };
  });
}
