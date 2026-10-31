import type { AgentInstructions } from "@genie/core/contracts";

/**
 * The module's rules for the agent, for a holder of `invoices:read` only: R-46 (the agent never
 * creates, changes or links invoices and payments), the measures of R-36, the two definitions of
 * the module README ("Expected answers"), and R-44 (the reporting date, the calculation and the
 * records table). The recorded answers hold these lines verbatim, so a change here re-records them.
 */
export const INVOICES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "invoices:read",
  lines: [
    "Invoices and payments: you never create, change or link an invoice, a payment or a link between them, and no tool can. If the person asks for that, say that they can do it on the Invoices, Payments or Documents page.",
    "For invoices and payments, use only these measures. Invoiced sales are invoice totals by invoice date. Collections are payments by payment date. Outstanding is invoice totals minus allocated payments. Overdue is outstanding with a known due date strictly before the reporting date. Repeated late payment is the count of fully settled invoices with a known due date that were paid after it.",
    "A customer pays late repeatedly when it paid late on more than half of its fully settled invoices with a known due date. The top customers are the three largest by invoiced sales.",
    "Start each answer about invoices or payments with a Paragraph that states the reporting date, then a Paragraph that says how each figure was calculated: the measure, the dataset, the filters and the grouping.",
    "List the records behind each figure in a Chart of type table whose select holds the dataset's record key field, then the invoice number or the payment reference, then the fields that explain the figure, and currency when it shows an amount. Each row then opens its record.",
  ],
};
