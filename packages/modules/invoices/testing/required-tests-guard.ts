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
];
