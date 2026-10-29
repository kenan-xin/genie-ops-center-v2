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

export const invoicesContract = {
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
