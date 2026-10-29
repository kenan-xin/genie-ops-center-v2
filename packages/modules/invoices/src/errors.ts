import { defineModuleErrors } from "@genie/core";

/**
 * The module's refusals, each `invoices:<code>` with its fixed safe message (decision 16). A
 * decision the person makes, such as a possible duplicate, is an answer, not one of these.
 */
export const INVOICE_ERRORS = defineModuleErrors("invoices", {
  "exceeds-invoice-balance":
    "That amount is more than the open balance of the invoice.",
  "exceeds-payment-balance":
    "That amount is more than the unallocated amount of the payment.",
  "link-mismatch":
    "A payment links only to an invoice of the same customer and the same currency.",
  "link-exists":
    "That payment is already linked to that invoice. Change the link instead.",
  "document-kind-mismatch":
    "That document is not of the type this save needs. Change its type first.",
  "document-already-saved": "A record from that document is already saved.",
  "reduction-invalid":
    "A reduction must lower one of the links of this invoice.",
  "reductions-insufficient":
    "The reduced links still exceed the new total. Reduce more.",
});
