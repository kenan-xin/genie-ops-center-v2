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

export const invoicesContract = {
  /** Saves an invoice as unpaid, then links the saved payments that name it (R-29, R-31, R-33). */
  saveInvoice: oc
    .route({ method: "POST", path: "/invoices/invoices" })
    .input(saveInvoiceInput)
    .output(saveInvoiceOutput),
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
