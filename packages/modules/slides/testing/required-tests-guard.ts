import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The slides module's integration manifest.
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
    reason:
      "Spec 7 R-52, R-53 and the plan limits: the deck constraints on a real Postgres",
    cases: [
      "a blank title",
      "a title of 81 characters",
      "a content hash that is not 64 hex characters",
      "an undo list of 11 entries",
      "21 slides",
    ].map((row) => `the slides schema refuses ${row}`),
  },
  {
    file: "testing/decks.integration.test.ts",
    reason:
      "Spec 7 R-52 and R-53: only the owner lists a deck, behind slides:read, and the content hash ignores key order",
    cases: [
      ...[
        "lists only the caller's own decks, the last changed first",
        "refuses the list to a person without slides:read",
      ].map((name) => `the slides listDecks procedure ${name}`),
      ...[
        "is the same for one content written with its keys in two orders",
        "changes when only the title changes",
      ].map((name) => `the slides content hash ${name}`),
    ],
  },
];
