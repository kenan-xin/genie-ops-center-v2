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
      ].map(
        (name) =>
          `the seeded Viewer is refused ${name} and changes nothing, and Finance is allowed`
      ),
      "a writer scoped to one customer links its records and is refused on another customer's",
      "a writer scoped to one customer saves its invoices and is refused another customer's",
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
];
