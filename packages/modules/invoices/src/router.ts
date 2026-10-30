import {
  AppError,
  CORE_ERRORS,
  implementModule,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { eq } from "drizzle-orm";

import { invoicesContract } from "./contract.ts";
import { RECORD_TYPES } from "./record-types.ts";
import { allocation } from "./schema.ts";
import { assertCanWrite } from "./services/ledger/access.ts";
import {
  changeAllocation,
  linkPayment,
  unlinkAllocation,
} from "./services/ledger/allocations.ts";
import { saveInvoice } from "./services/ledger/invoices.ts";
import { savePayment } from "./services/ledger/payments.ts";

const os = implementModule("invoices", invoicesContract);

const invoiceRef = (id: string) => ({ type: RECORD_TYPES.invoice, id });

const paymentRef = (id: string) => ({ type: RECORD_TYPES.payment, id });

/** Refuses a change of a link unless the caller may write both of its records. */
async function assertCanWriteLink(
  context: ModuleRequestContext,
  allocationId: string
): Promise<void> {
  const [link] = await context.tenant.db
    .select({
      invoiceId: allocation.invoiceId,
      paymentId: allocation.paymentId,
    })
    .from(allocation)
    .where(eq(allocation.id, allocationId));

  if (link === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  await assertCanWrite(context.caller, [
    invoiceRef(link.invoiceId),
    paymentRef(link.paymentId),
  ]);
}

/**
 * The module's router, built by core from the contract and mounted under the module id when the
 * module is enabled. Every handler reads through `context.tenant.db` and checks access through
 * `can()` or `scopesFor()` (DEC-34, DEC-39). The `implementModule` base refuses a call with
 * `module-disabled` when the entitlement is off, before any handler runs.
 */
export const invoicesRouter = os.router({
  saveInvoice: os.saveInvoice.handler(({ context, input }) =>
    saveInvoice(context, input)
  ),
  savePayment: os.savePayment.handler(({ context, input }) =>
    savePayment(context, input)
  ),
  linkPayment: os.linkPayment.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller, [
      invoiceRef(input.invoiceId),
      paymentRef(input.paymentId),
    ]);

    return withTransaction(context.tenant, (tx) =>
      linkPayment(context, tx, { ...input, automatic: false })
    );
  }),
  changeAllocation: os.changeAllocation.handler(async ({ context, input }) => {
    await assertCanWriteLink(context, input.id);

    await withTransaction(context.tenant, (tx) =>
      changeAllocation(context, tx, {
        allocationId: input.id,
        amountCents: input.amountCents,
      })
    );

    return { allocationId: input.id };
  }),
  unlinkAllocation: os.unlinkAllocation.handler(async ({ context, input }) => {
    await assertCanWriteLink(context, input.id);

    return withTransaction(context.tenant, (tx) =>
      unlinkAllocation(context, tx, { allocationId: input.id })
    );
  }),
});

export type InvoicesRouter = typeof invoicesRouter;
