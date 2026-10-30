import {
  AppError,
  moduleAudit,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { eq } from "drizzle-orm";

import type {
  SavePaidReceiptInput,
  SavePaidReceiptOutput,
} from "../../contract.ts";
import { INVOICE_ERRORS } from "../../errors.ts";
import { RECORD_TYPES } from "../../record-types.ts";
import { invoice, payment } from "../../schema.ts";
import { normalizeInvoiceNumber } from "../matching/decide.ts";
import { linkPayment } from "./allocations.ts";
import { authorizeCustomer, lockCustomer } from "./customers.ts";
import { assertDocumentKind } from "./documents.ts";
import { findPossibleDuplicateInvoice } from "./invoices.ts";

const audit = moduleAudit("invoices");

/**
 * Saves a paid receipt as one invoice, one payment of its total and one link between them, in one
 * transaction (R-33). It asks before it saves a Possible duplicate invoice, and keeps one record
 * per document.
 */
export async function savePaidReceipt(
  ctx: ModuleRequestContext,
  input: SavePaidReceiptInput
): Promise<SavePaidReceiptOutput> {
  await authorizeCustomer(ctx.caller, input.customer);

  return withTransaction(ctx.tenant, async (tx) => {
    if (input.documentId !== null) {
      await assertDocumentKind(tx, input.documentId, ["paid-receipt"]);
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

    const [savedInvoice] = await tx
      .insert(invoice)
      .values({
        customerId,
        documentId: input.documentId,
        number: input.number,
        invoiceDate: input.date,
        dueDate: input.dueDate,
        dueDateSource: input.dueDateSource,
        currency: input.currency,
        totalCents: input.totalCents,
        description: input.description,
      })
      .onConflictDoNothing({ target: invoice.documentId })
      .returning({ id: invoice.id });

    const [savedPayment] = await tx
      .insert(payment)
      .values({
        customerId,
        documentId: input.documentId,
        paymentDate: input.date,
        currency: input.currency,
        amountCents: input.totalCents,
        reference: input.reference,
        method: input.method,
        namedInvoiceNumbers: [normalizeInvoiceNumber(input.number)],
      })
      .onConflictDoNothing({ target: payment.documentId })
      .returning({ id: payment.id });

    // The race backstop: another save of the same document committed after the check above.
    if (savedInvoice === undefined || savedPayment === undefined) {
      throw new AppError(INVOICE_ERRORS["document-already-saved"]);
    }

    const { allocationId } = await linkPayment(ctx, tx, {
      invoiceId: savedInvoice.id,
      paymentId: savedPayment.id,
      amountCents: input.totalCents,
      automatic: false,
    });

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "invoices:receipt-saved",
      { type: RECORD_TYPES.invoice, id: savedInvoice.id },
      "Saved a paid receipt.",
      { paymentId: savedPayment.id }
    );

    return {
      outcome: "saved",
      invoiceId: savedInvoice.id,
      paymentId: savedPayment.id,
      allocationId,
      customerId,
    };
  });
}
