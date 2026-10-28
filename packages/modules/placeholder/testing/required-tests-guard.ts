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
      "the placeholder read procedure against a real database refuses the read with module-disabled when the placeholder entitlement is off",
      "the placeholder read procedure against a real database answers only the named record to a person with a record-scoped read grant",
      "the placeholder read procedure against a real database refuses an anonymous caller",
      "the placeholder read procedure against a real database answers a dataset source whose aliased subquery reads the seeded rows",
      "the placeholder read procedure against a real database appends placeholder:admin to Tenant administrator on enable and removes it on disable",
    ],
  },
  {
    file: "testing/datasets.integration.test.ts",
    reason: "Spec 7 AC-2 and AC-3: the dataset seam on the placeholder",
    cases: [
      "the placeholder dataset through queryDataset lists the placeholder dataset only to a person who holds placeholder:read",
      "the placeholder dataset through queryDataset sums amounts per currency",
      "the placeholder dataset through queryDataset counts quantities in labelled ranges in range order, leaving out nulls and values outside every range",
      "the placeholder dataset through queryDataset groups a date by week from Monday and answers ISO dates",
      "the placeholder dataset through queryDataset filters by record id against the uuid column",
      "the placeholder dataset through queryDataset refuses a person without placeholder:read, and answers a record-scoped reader only that record",
      "the placeholder dataset through queryDataset refuses an unknown field with dataset-query-invalid naming select.0",
      "the placeholder dataset through queryDataset returns at most 1,000 rows and says it was truncated",
      "the placeholder dataset through queryDataset stops a query after 5 seconds",
      "the placeholder dataset through queryDataset totals money per currency: none, one, two",
      "the placeholder dataset through queryDataset skips the dataset of a disabled module",
      "the placeholder dataset through queryDataset the reporting date moves the result",
    ],
  },
  {
    file: "testing/events.integration.test.ts",
    reason:
      "R-53 to R-58 require the placeholder's fast, durable, and serialized subscriptions to run end to end against a real database",
    cases: [
      "the placeholder event subscriptions against Testcontainers Postgres runs its fast, durable, and serialized effects end to end",
    ],
  },
];
