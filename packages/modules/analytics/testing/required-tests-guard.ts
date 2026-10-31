import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The analytics module's integration manifest.
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
      "Spec 7 R-48 and the plan limits: the dashboard constraints on a real Postgres",
    cases: [
      ...[
        "a second dashboard of one owner whose name differs only in case and outer spaces",
        "a blank name",
        "a name of 81 characters",
        "version 0",
        "an undo list of 21 entries",
      ].map((row) => `the analytics schema refuses ${row}`),
      "the analytics schema lets two owners use one dashboard name",
    ],
  },
  {
    file: "testing/dashboards.integration.test.ts",
    reason:
      "Spec 7 R-48, R-49 and R-51: only the owner reads and writes a dashboard, behind can(), the chart gate, Undo and the audit",
    cases: [
      ...[
        "lists only the caller's own dashboards, the last changed first",
        "refuses the list to a person without analytics:read",
      ].map((name) => `the analytics listDashboards procedure ${name}`),
      ...[
        ...[
          "readDashboard",
          "changeDashboard",
          "undoDashboard",
          "deleteDashboard",
        ].map(
          (procedure) =>
            `answer not-found to ${procedure} on another person's dashboard and leave it the same`
        ),
        ...[
          "createDashboard",
          "changeDashboard",
          "undoDashboard",
          "deleteDashboard",
          "readDashboard",
        ].map((procedure) => `refuse ${procedure} to a person without its key`),
        "refuse a change on an older version and write nothing",
        "refuse a panel on a dataset this deployment lacks and write nothing",
        "undo two renames in reverse order, then answer nothing-to-undo",
        "refuse an Undo whose panel the gate refuses now and restore nothing",
        "save a rename of a dashboard that holds a panel the gate refuses now",
        "undo a rename of a dashboard that holds a panel the gate refuses now",
        "write one audit row for each create, change, Undo and delete",
        ...["create", "rename"].map(
          (how) =>
            `refuse to ${how} a name the owner already uses in another case and with outer spaces`
        ),
      ].map((name) => `the analytics dashboard procedures ${name}`),
    ],
  },
];
