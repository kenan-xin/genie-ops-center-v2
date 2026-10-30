import { oc } from "@genie/core/rpc";
import { z } from "zod";

/**
 * The module's API, published as `@genie/module-invoices/contract` (ADR 0011). It imports only zod
 * and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this file
 * without pulling any server code. Every procedure declares its route, and every path starts with
 * the module id.
 */

/** Where an invoice's due date came from. `unspecified` has no due date and is never overdue (R-29). */
export const DUE_DATE_SOURCES = ["document", "person", "unspecified"] as const;

export type DueDateSource = (typeof DUE_DATE_SOURCES)[number];

export const recordId = z.uuid();

/** A positive amount in integer cents that fits the `integer` amount columns. */
export const cents = z.number().int().min(1).max(2_147_483_647);

export const currencyCode = z.string().regex(/^[A-Z]{3}$/);

export const isoDate = z.iso.date();

/** An existing customer by id, or a new one that the person confirmed (R-33: created only on confirmation). */
export const customerChoice = z.union([
  z.strictObject({ id: recordId }),
  z.strictObject({
    name: z.string().trim().min(1).max(200),
    email: z.email().nullable(),
    confirmed: z.literal(true),
  }),
]);

export const saveInvoiceInput = z
  .object({
    documentId: recordId.nullable(),
    customer: customerChoice,
    number: z.string().trim().min(1).max(64),
    invoiceDate: isoDate,
    dueDate: isoDate.nullable(),
    dueDateSource: z.enum(DUE_DATE_SOURCES),
    paymentTerms: z.string().trim().min(1).max(500).nullable(),
    currency: currencyCode,
    totalCents: cents,
    description: z.string().trim().min(1).max(1000).nullable(),
    keepPossibleDuplicate: z.boolean(),
  })
  .refine(
    (input) =>
      (input.dueDate === null) === (input.dueDateSource === "unspecified"),
    {
      path: ["dueDate"],
      message:
        "A due date is given exactly when its source is not unspecified.",
    }
  );

export type SaveInvoiceInput = z.infer<typeof saveInvoiceInput>;

/** `possible-duplicate` is the person's decision to make, not an error (decision 16). */
export const saveInvoiceOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    invoiceId: z.string(),
    customerId: z.string(),
    linkedPayments: z.array(
      z.object({
        paymentId: z.string(),
        allocationId: z.string(),
        amountCents: cents,
      })
    ),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SaveInvoiceOutput = z.infer<typeof saveInvoiceOutput>;

export const savePaymentInput = z.object({
  documentId: recordId.nullable(),
  customer: customerChoice,
  paymentDate: isoDate,
  currency: currencyCode,
  amountCents: cents,
  reference: z.string().trim().min(1).max(200).nullable(),
  method: z.string().trim().min(1).max(100).nullable(),
  namedInvoiceNumbers: z.array(z.string().trim().min(1).max(64)).max(20),
  /** The links the person chose. The browser save never links by itself (decision 4). */
  allocations: z
    .array(z.strictObject({ invoiceId: recordId, amountCents: cents }))
    .max(20),
  keepPossibleDuplicate: z.boolean(),
});

export type SavePaymentInput = z.infer<typeof savePaymentInput>;

export const savePaymentOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    paymentId: z.string(),
    customerId: z.string(),
    allocations: z.array(
      z.object({
        allocationId: z.string(),
        invoiceId: z.string(),
        amountCents: cents,
      })
    ),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SavePaymentOutput = z.infer<typeof savePaymentOutput>;

/** A paid receipt: one invoice, one payment of its total and one link between them (R-33). */
export const savePaidReceiptInput = z
  .object({
    documentId: recordId.nullable(),
    customer: customerChoice,
    number: z.string().trim().min(1).max(64),
    date: isoDate,
    dueDate: isoDate.nullable(),
    dueDateSource: z.enum(DUE_DATE_SOURCES),
    currency: currencyCode,
    totalCents: cents,
    description: z.string().trim().min(1).max(1000).nullable(),
    reference: z.string().trim().min(1).max(200).nullable(),
    method: z.string().trim().min(1).max(100).nullable(),
    keepPossibleDuplicate: z.boolean(),
  })
  .refine(
    (input) =>
      (input.dueDate === null) === (input.dueDateSource === "unspecified"),
    {
      path: ["dueDate"],
      message:
        "A due date is given exactly when its source is not unspecified.",
    }
  );

export type SavePaidReceiptInput = z.infer<typeof savePaidReceiptInput>;

export const savePaidReceiptOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    invoiceId: z.string(),
    paymentId: z.string(),
    allocationId: z.string(),
    customerId: z.string(),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SavePaidReceiptOutput = z.infer<typeof savePaidReceiptOutput>;

/** Each reduction is the new amount of one link of this invoice; 0 removes it (decision 9). */
export const correctInvoiceTotalInput = z.object({
  id: recordId,
  totalCents: cents,
  reductions: z
    .array(
      z.strictObject({
        allocationId: recordId,
        amountCents: z.number().int().min(0),
      })
    )
    .max(20),
});

export type CorrectInvoiceTotalInput = z.infer<typeof correctInvoiceTotalInput>;

/** `choose-links` asks the person which links to reduce, and nothing is written (R-32). */
export const correctInvoiceTotalOutput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("corrected") }),
  z.object({
    outcome: z.literal("choose-links"),
    excessCents: z.number().int(),
    allocations: z.array(
      z.object({
        allocationId: z.string(),
        paymentId: z.string(),
        amountCents: cents,
      })
    ),
  }),
]);

export type CorrectInvoiceTotalOutput = z.infer<
  typeof correctInvoiceTotalOutput
>;

/** `duplicate` is an exact copy of a stored document: nothing is added (R-23, decision 10). */
export const uploadDocumentOutput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("uploaded"), documentId: z.string() }),
  z.object({
    outcome: z.literal("duplicate"),
    documentId: z.string(),
    label: z.string(),
  }),
]);

export type UploadDocumentOutput = z.infer<typeof uploadDocumentOutput>;

export const invoicesContract = {
  /** Stores one PDF once per exact file, for the reading job (R-23, decisions 9 and 10). */
  uploadDocument: oc
    .route({ method: "POST", path: "/invoices/documents" })
    .input(z.object({ file: z.file() }))
    .output(uploadDocumentOutput),
  /** Reads a Could not read document again, from its first attempt (R-26). */
  retryReading: oc
    .route({ method: "POST", path: "/invoices/documents/{id}/retry" })
    .input(z.object({ id: recordId }))
    .output(z.object({ documentId: z.string() })),
  /** Saves an invoice as unpaid, then links the saved payments that name it (R-29, R-31, R-33). */
  saveInvoice: oc
    .route({ method: "POST", path: "/invoices/invoices" })
    .input(saveInvoiceInput)
    .output(saveInvoiceOutput),
  /** Saves a payment with the links the person chose, all or nothing (R-33, R-34). */
  savePayment: oc
    .route({ method: "POST", path: "/invoices/payments" })
    .input(savePaymentInput)
    .output(savePaymentOutput),
  /** Saves a paid receipt as one invoice, one payment and one link of the full amount (R-33). */
  savePaidReceipt: oc
    .route({ method: "POST", path: "/invoices/receipts" })
    .input(savePaidReceiptInput)
    .output(savePaidReceiptOutput),
  /** Corrects an invoice total. Below its allocations, it asks which links to reduce (R-32). */
  correctInvoiceTotal: oc
    .route({ method: "PATCH", path: "/invoices/invoices/{id}" })
    .input(correctInvoiceTotalInput)
    .output(correctInvoiceTotalOutput),
  /** Links an amount of a payment to an invoice of the same customer and currency (R-32, R-34). */
  linkPayment: oc
    .route({ method: "POST", path: "/invoices/allocations" })
    .input(
      z.object({ invoiceId: recordId, paymentId: recordId, amountCents: cents })
    )
    .output(z.object({ allocationId: z.string() })),
  /** Changes the amount of one link. A changed automatic link becomes a person's link. */
  changeAllocation: oc
    .route({ method: "PATCH", path: "/invoices/allocations/{id}" })
    .input(z.object({ id: recordId, amountCents: cents }))
    .output(z.object({ allocationId: z.string() })),
  /** Removes one link. Its amount returns to the payment as unallocated. */
  unlinkAllocation: oc
    .route({ method: "DELETE", path: "/invoices/allocations/{id}" })
    .input(z.object({ id: recordId }))
    .output(z.object({ unlinkedCents: z.number() })),
};

export type InvoicesContract = typeof invoicesContract;
