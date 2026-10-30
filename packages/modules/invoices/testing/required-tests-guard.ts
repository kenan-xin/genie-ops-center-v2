import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The invoices module's integration manifest.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. The validator and its case shape are core's, shared
 * through `@genie/core/testing/required-tests-validator`, so this module keeps
 * only the manifest that is its own. Each entry is derived from a named
 * acceptance clause.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/schema.integration.test.ts",
    reason: "Spec 7 R-22 and R-34: the module's constraints on a real Postgres",
    cases: [
      "a second document with the same hash",
      "a second allocation of one invoice and one payment",
      "an allocation of 0 cents",
      "an invoice total of 0 cents",
      "a payment amount of 0 cents",
      "a due date with source unspecified",
      "no due date with source document",
      "a customer name that differs only in case and outer spaces",
      "a currency in lower case",
      "an extracted field origin without its quote",
    ].map((row) => `the invoices schema refuses ${row}`),
  },
  {
    file: "testing/allocations.integration.test.ts",
    reason:
      "Spec 7 R-32 and R-34: links under row locks never exceed a total, and every change leaves an event and an audit row",
    cases: [
      "two links at the same time never exceed the invoice",
      "two links at the same time never exceed the payment",
      "at the balance edge, a link equal to both open amounts is saved",
      "at the balance edge, one cent above the invoice's open balance is refused",
      "at the balance edge, one cent above the payment's unallocated amount is refused",
      "at the balance edge, a change to the open balance plus the link's own amount is saved",
      "at the balance edge, a change one cent above the open balance plus the link's own amount is refused and leaves the amount",
      "refuses a link to an invoice of another customer with link-mismatch",
      "refuses a link to a payment in another currency with link-mismatch",
      "link, change and unlink write three events and three audit rows, and return the amount",
    ].map((row) => `invoice allocations ${row}`),
  },
  {
    file: "testing/access.integration.test.ts",
    reason:
      "Spec 7 R-39 and decision 13: only invoices:write on the record writes, through the seeded roles",
    cases: [
      ...[
        "linkPayment",
        "changeAllocation",
        "unlinkAllocation",
        "saveInvoice",
        "savePayment",
        "savePaidReceipt",
        "correctInvoiceTotal",
      ].map(
        (name) =>
          `the seeded Viewer is refused ${name} and changes nothing, and Finance is allowed`
      ),
      "a writer scoped to one customer links its records and is refused on another customer's",
      "a writer scoped to one customer saves its invoices and is refused another customer's",
      "a writer scoped to one customer saves its payments and is refused another customer's",
    ].map((row) => `invoices write access ${row}`),
  },
  {
    file: "testing/invoices.integration.test.ts",
    reason:
      "Spec 7 R-31 and R-33: a new customer only on confirmation, Possible duplicate, one record per document, and R-30 when a named invoice is saved",
    cases: [
      "a confirmed new customer is created once and reused when named in another case",
      "a writer scoped to one customer is refused a new customer",
      "the same customer and number answers possible-duplicate until the person keeps it",
      "refuses a purchase-order document with document-kind-mismatch and saves nothing",
      "refuses a payment document with document-kind-mismatch and saves nothing",
      "a second save from the same document is refused with document-already-saved",
      ...[
        "a payment of 300,000 naming INV-9 links automatically",
        "a payment whose amount was corrected stays unallocated",
        "a payment above the total stays unallocated",
        "a payment naming two invoices stays unallocated",
        "a payment in another currency stays unallocated",
        "of two payments the older links and the second stays unallocated",
      ].map((row) => `saving invoice inv-9 of 720,000, ${row}`),
    ].map((row) => `invoice saves ${row}`),
  },
  {
    file: "testing/payments.integration.test.ts",
    reason:
      "Spec 7 R-26, R-30, R-33 and R-34: a payment links by itself only when R-30 holds, Possible duplicate, one record per document, and a refused link saves nothing",
    cases: [
      "a payment saved with two chosen links saves both, and a link above an open balance saves nothing",
      ...[
        "one named invoice with checked facts links automatically",
        "two named invoices answer a split",
        "an amount above the open balance answers an overpayment",
        "a corrected amount answers confirm",
        "no named invoice and an amount equal to one open balance answers suggestions",
        "no named invoice and no equal open balance answers no-match",
      ].map(
        (row) =>
          `a reading against INV-A of 520,000, INV-B of 405,000 and INV-C of 420,000: ${row}`
      ),
      "a reading of an unknown customer answers needs-review and writes no customer and no payment",
      "the same customer, date, amount and currency answers possible-duplicate in both paths until the person keeps it",
      "a second reading of a saved document answers already-saved, and a save by hand of it is refused",
    ].map((row) => `payment saves ${row}`),
  },
  {
    file: "testing/receipts-and-corrections.integration.test.ts",
    reason:
      "Spec 7 R-32 and R-33: a paid receipt is one invoice, one payment and one link, and a total corrected below its allocations asks which links to reduce",
    cases: [
      "a paid receipt of 180,000 saves one invoice, one payment and one link of the full amount",
      ...["600,000", "300,000"].map(
        (total) =>
          `an invoice of 500,000 with links of 300,000 corrected to ${total} is saved and audited`
      ),
      "an invoice of 500,000 with links of 300,000 corrected to 250,000 with no reductions answers choose-links and changes nothing",
      ...[
        "the first link reduced to 150,000 is corrected",
        "the second link reduced to 0 is corrected and removes it",
        "the first link reduced to 190,000 only is refused with reductions-insufficient",
      ].map(
        (row) =>
          `an invoice of 500,000 with links of 300,000 corrected to 250,000: ${row}`
      ),
      "a reduction naming a link of another invoice is refused with reduction-invalid",
      "a reduction raising the link of 200,000 to 250,000 is refused with reduction-invalid",
    ].map((row) => `receipts and corrections ${row}`),
  },
  {
    file: "testing/datasets.integration.test.ts",
    reason:
      "Spec 7 R-9, R-11, R-29, R-35 and R-36: the measures at the reporting date, the read scope and the record route",
    cases: [
      "at 2026-10-27, due the day before is overdue by one day, due on the day is not, and no due date is never overdue but stays outstanding",
      "a payment and an invoice dated after the reporting date change nothing",
      "settledOn is the last payment date, paidLate holds only for a settled invoice with a due date, and the customer counts 2 settled and 1 late",
      "a payment answers its unallocated amount and each link is one allocation row",
      "a link to an invoice dated after the reporting date leaves its payment unallocated and has no allocation row",
      "a person reading one customer sees only its rows in all four datasets",
      "recordRoute opens an invoice only for a person with invoices:use",
    ].map((row) => `invoice datasets ${row}`),
  },
  {
    file: "testing/demo-history.integration.test.ts",
    reason:
      "Spec 7 AC-6 and R-36: the demo history saved through the procedures gives every baseline total, every invoice status and the nine answers",
    cases: [
      "demo history gives every total in expected_baseline_answers.json at 2026-10-27",
      "demo history gives every invoice's outstanding, days overdue and paid-late flag in expected_invoice_status.csv",
      ...[
        "overdue-invoices",
        "repeated-late-payers",
        "overdue-balances",
        "monthly-invoiced-and-collected",
        "top-customers-by-sales",
        "top-customers-overdue",
        "invoices-without-due-date",
        "manual-due-dates",
        "partial-payments",
      ].map(
        (id) =>
          `demo history answers the ${id} question from expected-answers.json`
      ),
    ],
  },
];
