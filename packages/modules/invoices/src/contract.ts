/**
 * The module's API, published as `@genie/module-invoices/contract` (ADR 0011). It imports only zod
 * and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this file
 * without pulling any server code. Every procedure declares its route, and every path starts with
 * the module id.
 */

/** Where an invoice's due date came from. `unspecified` has no due date and is never overdue (R-29). */
export const DUE_DATE_SOURCES = ["document", "person", "unspecified"] as const;

export type DueDateSource = (typeof DUE_DATE_SOURCES)[number];

export const invoicesContract = {};

export type InvoicesContract = typeof invoicesContract;
