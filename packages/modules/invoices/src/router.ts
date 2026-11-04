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
import { discardDocument } from "./services/documents/discard.ts";
import {
  loadDocumentInbox,
  loadDocumentStatus,
} from "./services/documents/inbox.ts";
import { setDocumentKind } from "./services/documents/kind.ts";
import { loadDocumentReview } from "./services/documents/review.ts";
import { uploadDocument } from "./services/documents/upload.ts";
import { assertCanWrite } from "./services/ledger/access.ts";
import {
  changeAllocation,
  linkPayment,
  unlinkAllocation,
} from "./services/ledger/allocations.ts";
import {
  correctInvoiceTotal,
  saveInvoice,
} from "./services/ledger/invoices.ts";
import { listOpenInvoices } from "./services/ledger/open-invoices.ts";
import { savePayment } from "./services/ledger/payments.ts";
import { savePaidReceipt } from "./services/ledger/receipts.ts";
import { loadInvoiceList, loadPaymentList } from "./services/pages/lists.ts";
import {
  loadInvoiceRecord,
  loadPaymentRecord,
} from "./services/pages/records.ts";
import { retryReading } from "./services/reading/job.ts";

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
  listDocuments: os.listDocuments.handler(({ context, input }) =>
    loadDocumentInbox(context, input.after)
  ),
  documentStatus: os.documentStatus.handler(({ context, input }) =>
    loadDocumentStatus(context, input.ids)
  ),
  getDocumentReview: os.getDocumentReview.handler(({ context, input }) =>
    loadDocumentReview(context, input.id)
  ),
  getInvoiceRecord: os.getInvoiceRecord.handler(({ context, input }) =>
    loadInvoiceRecord(context, input.id)
  ),
  getPaymentRecord: os.getPaymentRecord.handler(({ context, input }) =>
    loadPaymentRecord(context, input.id)
  ),
  setDocumentKind: os.setDocumentKind.handler(({ context, input }) =>
    setDocumentKind(context, input)
  ),
  discardDocument: os.discardDocument.handler(({ context, input }) =>
    discardDocument(context, input.id)
  ),
  listInvoices: os.listInvoices.handler(async ({ context, input }) => {
    const view = await loadInvoiceList(context, input.after, input.params);

    return {
      ...view,
      rows: [...view.rows],
      counts: view.counts === null ? null : { ...view.counts },
      summary: view.summary === null ? null : [...view.summary],
    };
  }),
  listPayments: os.listPayments.handler(async ({ context, input }) => {
    const view = await loadPaymentList(context, input.after, input.params);

    return {
      ...view,
      rows: [...view.rows],
      counts: view.counts === null ? null : { ...view.counts },
      summary: view.summary === null ? null : [...view.summary],
    };
  }),
  listOpenInvoices: os.listOpenInvoices.handler(({ context, input }) =>
    listOpenInvoices(context, input)
  ),
  uploadDocument: os.uploadDocument.handler(({ context, input }) =>
    uploadDocument(context, input.file)
  ),
  retryReading: os.retryReading.handler(({ context, input }) =>
    retryReading(context, input.id)
  ),
  saveInvoice: os.saveInvoice.handler(({ context, input }) =>
    saveInvoice(context, input)
  ),
  savePayment: os.savePayment.handler(({ context, input }) =>
    savePayment(context, input)
  ),
  savePaidReceipt: os.savePaidReceipt.handler(({ context, input }) =>
    savePaidReceipt(context, input)
  ),
  correctInvoiceTotal: os.correctInvoiceTotal.handler(({ context, input }) =>
    correctInvoiceTotal(context, input)
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
