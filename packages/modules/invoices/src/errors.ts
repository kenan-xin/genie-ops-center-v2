import { defineModuleErrors } from "@genie/core";

/**
 * The module's refusals, each `invoices:<code>` with its fixed safe message (decision 16). A
 * decision the person makes, such as a possible duplicate, is an answer, not one of these. A
 * request that cannot be valid answers 400; one that clashes with the stored ledger answers 409.
 */
export const INVOICE_ERRORS = defineModuleErrors("invoices", {
  "exceeds-invoice-balance": {
    message: "That amount is more than the open balance of the invoice.",
    status: 409,
  },
  "exceeds-payment-balance": {
    message: "That amount is more than the unallocated amount of the payment.",
    status: 409,
  },
  "link-mismatch": {
    message:
      "A payment links only to an invoice of the same customer and the same currency.",
    status: 400,
  },
  "link-exists": {
    message:
      "That payment is already linked to that invoice. Change the link instead.",
    status: 409,
  },
  "document-kind-mismatch": {
    message:
      "That document is not of the type this save needs. Change its type first.",
    status: 409,
  },
  "document-already-saved": {
    message: "A record from that document is already saved.",
    status: 409,
  },
  "reduction-invalid": {
    message: "A reduction must lower one of the links of this invoice.",
    status: 400,
  },
  "reductions-insufficient": {
    message: "The reduced links still exceed the new total. Reduce more.",
    status: 409,
  },
});
