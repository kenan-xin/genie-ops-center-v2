import type { AgentInstructions } from "@genie/core/contracts";

/**
 * The module's rules for the agent, for a holder of `invoices:read` only: R-46 (the agent never
 * creates, changes or links invoices and payments), the measures of R-36, the two definitions of
 * the module README ("Expected answers"), and R-44 (the measure and the reporting date after the
 * result, and the records table). Core's prompt holds the general answer rules; these lines say
 * only what is about invoices. The recorded answers hold these lines verbatim, so a change here
 * re-records them.
 */
export const INVOICES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "invoices:read",
  lines: [
    "Invoices and payments: you never create, change or link an invoice, a payment or a link between them, and no tool can. If the person asks for that, say that they can do it on the Invoices, Payments or Documents page.",
    "For invoices and payments, use only these measures. Invoiced sales are invoice totals by invoice date. Collections are payments by payment date. Outstanding is invoice totals minus allocated payments. Overdue is outstanding with a known due date strictly before the reporting date. Repeated late payment is the count of fully settled invoices with a known due date that were paid after it.",
    "A customer pays late repeatedly when it paid late on more than half of its fully settled invoices with a known due date. The top customers are the three largest by invoiced sales.",
    "In an answer about invoices or payments, say after the result which of these measures you used and the reporting date, in plain words.",
    "List the records behind each figure in a table made with make-artifact. Select the dataset's record key field, then its summaryFields, then the fields that explain the figure, and its currency field when the table shows an amount. A payments table selects the payment reference after the record key field. Each row then opens its record.",
  ],
};
