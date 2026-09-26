import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The placeholder module's integration manifest.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. The validator and its case shape are core's, shared
 * through `@genie/core/testing/required-tests-validator`, so the module keeps
 * only the manifest that is its own. Each entry is derived from a named
 * acceptance clause:
 *
 * - R-24 and R-38: the router and schema proof runs against a real Postgres
 *   with the real histories applied, and no part of the database is mocked.
 * - R-24: core's migration ledger and this module's own ledger are separate,
 *   and this module's one migration is recorded in its own ledger.
 * - DEC-34: the standing tenant-isolation test reads through this router, so
 *   its read path cannot silently stop running.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/router.integration.test.ts",
    reason:
      "R-24 and R-38 require the placeholder router and schema proof to run against a real database, and DEC-34's isolation proof reads through this router",
    cases: [
      "the placeholder read procedure against a real database answers the rows this deployment holds",
      "the placeholder read procedure against a real database refuses a caller without the key, and reads nothing",
      "the placeholder read procedure against a real database keeps core's ledger and the module's ledger apart",
      "the placeholder read procedure against a real database recorded the module's one migration in the module's ledger",
    ],
  },
];
