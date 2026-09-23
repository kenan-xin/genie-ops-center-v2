import { resolve } from "node:path";

import { RELEASE_MATRIX_FULL_NAMES } from "./release-matrix-cases.ts";

/**
 * The mandatory manifest and the validator behind it.
 *
 * `passWithNoTests: false` cannot see a mandatory case that was filtered away
 * while other files still collected, and a suite cannot prove its own execution
 * from inside an `afterAll` that never runs when every case is skipped (the
 * reviewed bypass: `-t __no_match__` exited 0 with the isolation case skipped).
 * So the requirement is named here, outside the skippable suite, as absolute
 * case names per file: after vitest exits, the JSON report is read back and
 * every named case must have been collected, executed, and passed. Cases in a
 * required file beyond the named ones are ordinary optional coverage.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. Each entry is derived from a named acceptance clause,
 * not from a blanket "all tests mandatory" rule:
 *
 * - the two-database isolation proof (R-20, AC-4),
 * - the one-context proof across real framework bundles (AC-26),
 * - the viewer provider-count proof (R-49a, AC-25), zero calls on background
 *   requests at the viewer URL and exactly one for a normal viewer document,
 * - the devtools exclusion proof (S0-09), which is the only thing standing
 *   between a development diagnostic and the image a customer runs,
 * - the customer image matrix (S0-11, R-53/AC-17/AC-18/AC-19): the development
 *   and explicitly-empty images start on fresh disposable databases, the empty
 *   image renders no placeholder route or table, and the image history and
 *   filesystem carry only MODULE_INCLUDE. A missing Docker daemon fails these
 *   cases rather than skipping them.
 * - the build-input exclusion proof (Spec 0 AC-5/AC-24, `pg4`): the builder
 *   stage prunes unselected module folders, refuses an unset selection, fails
 *   on a stray folder, and an import of an excluded module fails the build.
 */
export type RequiredCase = {
  readonly file: string;
  readonly cases: readonly string[];
};

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/isolation.integration.test.ts",
    cases: [
      "two tenant contexts in one process each read returns only its own database's row",
      "two tenant contexts in one process the two databases are genuinely separate",
    ],
  },
  {
    file: "testing/image.startup.test.ts",
    cases: [
      "the built image shares one context across concurrent page, tRPC and viewer requests",
      "the built image serves no migration SQL url",
      "the built image exposes no migration SQL content in its public corpus",
      "the built image detects the repository migration SQL in a public corpus, raw, JSON-escaped and base64 encoded, and only that SQL",
      "the built image fails closed when a migration SQL file is empty",
      "the built image rejects symlinked public corpus entries with a named diagnostic",
      "the built image migrates the real database from the repository SQL",
    ],
  },
  {
    file: "testing/prune-public-migration-sql.test.ts",
    cases: [
      "the prune-public-migration-sql tool prunes a public migration sql that is byte-identical to a server asset",
      "the prune-public-migration-sql tool fails and preserves everything when public sql bytes match a server asset",
      "the prune-public-migration-sql tool fails and preserves everything when standalone public sql bytes match a server asset",
      "the prune-public-migration-sql tool rejects static sql with no byte-identical server asset and deletes nothing",
      "the prune-public-migration-sql tool rejects authored sql under public and deletes nothing",
      "the prune-public-migration-sql tool throws when the build output is missing or malformed",
      "the prune-public-migration-sql tool throws when the standalone tree has zero or multiple server.js roots",
      "the prune-public-migration-sql tool succeeds as a no-op when the build contains no migration sql",
      "the prune-public-migration-sql tool ignores sql under node_modules outside the served outputs",
      "the prune-public-migration-sql tool treats node_modules inside served static as served bytes",
      "the prune-public-migration-sql tool collects uppercase sql spellings",
      "the prune-public-migration-sql tool unlinks only the collected files and preserves server bytes",
      "the prune-public-migration-sql tool fails closed on symlinks under served outputs and preserves link and target",
      "the prune-public-migration-sql tool fails closed when build roots are symlinked",
      "the prune-public-migration-sql tool the cli exits 0 on success and 1 on validation failure",
    ],
  },
  {
    file: "testing/devtools-exclusion.test.ts",
    cases: [
      "the production build and the devtools reads a real build, so an empty scan cannot pass",
      "the production build and the devtools finds application code by the same search, so the method works",
      "the production build and the devtools ships no executable code carrying hideUntilHover",
      "the production build and the devtools ships no executable code carrying TanStack Pacer",
      "the production build and the devtools ships no executable code carrying TanStack Form",
      "the production build and the devtools ships no executable code carrying No user is signed in. Section 0 has no identity yet.",
      "the production build and the devtools ships no executable code carrying deploymentDiagnostics",
      "the production build and the devtools installs no devtools package in the image it runs from",
    ],
  },
  {
    file: "testing/image-matrix.integration.test.ts",
    cases: RELEASE_MATRIX_FULL_NAMES,
  },
  {
    file: "testing/image-prune.integration.test.ts",
    cases: [
      "the builder-stage module prune keeps the selected module and removes every other module folder, as the build log shows",
      "the builder-stage module prune prunes every module folder for an explicitly empty selection although the app depends on placeholder",
      "the builder-stage module prune refuses an unset MODULE_INCLUDE",
      "the builder-stage module prune fails the build when a folder the selection does not name remains",
      "the builder-stage module prune resolves a direct and a subpath import of a selected module",
      "the builder-stage module prune fails the build on a direct import of an excluded module",
      "the builder-stage module prune fails the build on a subpath import of an excluded module",
    ],
  },
  {
    file: "testing/viewer-background.integration.test.ts",
    cases: [
      "the viewer URL a normal viewer document invokes the frame origin provider exactly once",
      "the viewer URL an RSC request at the viewer URL invokes no provider",
      "the viewer URL a next-router-prefetch request at the viewer URL invokes no provider",
      "the viewer URL a purpose-prefetch request at the viewer URL invokes no provider",
    ],
  },
];

/** Jest-schema statuses that mean a collected case did not execute. */
const NOT_EXECUTED = new Set(["skipped", "pending", "todo"]);

/** One reported case in vitest's jest-schema JSON report. */
export type ReportAssertion = {
  readonly fullName?: unknown;
  readonly status?: unknown;
};

/** One reported file with its cases in vitest's jest-schema JSON report. */
export type ReportFileResult = {
  readonly name?: unknown;
  readonly assertionResults?: unknown;
};

/** The shape of the whole report this validator reads. */
export type TestReport = {
  readonly testResults?: unknown;
};

/**
 * True for a usable non-empty string field, such as a reported file path or a
 * test's full name. The same boundary parse as the module inventory's manifest
 * fields, for the same reason.
 */
function isNonEmptyString(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of report bytes
  return typeof value === "string" && value.trim() !== "";
}

/**
 * True for a parsed JSON object. A null or primitive entry in the report is
 * dropped here rather than read, so a malformed file result can only make its
 * file report as absent — never crash the validator and never pass it.
 */
function isRecord(value: unknown): value is object {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of report bytes
  return typeof value === "object" && value !== null;
}

/** The report's own absolute path for one file result, or `undefined`. */
function resultPath(entry: ReportFileResult, workingDirectory: string) {
  return isNonEmptyString(entry.name)
    ? resolve(workingDirectory, entry.name)
    : undefined;
}

/**
 * Reads one vitest JSON report against the manifest and returns one sentence
 * per violation. An empty array means every required case was collected,
 * executed and passed.
 *
 * The report is untrusted input: a missing, malformed, or shape-less report is
 * itself the first violation, so a crashed or silenced vitest can never read as
 * a green run.
 */
export function requiredViolations(
  report: TestReport,
  required: readonly RequiredCase[],
  workingDirectory: string
): readonly string[] {
  if (!Array.isArray(report.testResults)) {
    return [
      "The vitest JSON report is missing or malformed, so nothing is proven. Failing closed.",
    ];
  }

  // SAFETY: the report is vitest's documented jest-schema output, guarded as an
  // array immediately above. Null and non-object entries are dropped by the
  // record check below, a mandatory file whose only entry was dropped therefore
  // reports as never collected, and a mandatory case is satisfied only by a
  // string full name matching plus a status of exactly "passed". A malformed
  // entry can only fail the run, never pass it.
  const results = report.testResults as readonly ReportFileResult[];

  const collected = new Map<string, ReportFileResult>();

  for (const entry of results.filter(isRecord)) {
    const path = resultPath(entry, workingDirectory);

    if (path !== undefined) collected.set(path, entry);
  }

  const violations: string[] = [];

  for (const { file, cases } of required) {
    const absolute = resolve(workingDirectory, file);
    const entry = collected.get(absolute);

    if (entry === undefined) {
      violations.push(
        `${file}: was never collected. A mandatory file cannot silently go missing.`
      );

      continue;
    }

    if (!Array.isArray(entry.assertionResults)) {
      violations.push(`${file}: collected no test cases.`);

      continue;
    }

    // SAFETY: guarded as an array immediately above; the same field-by-field
    // re-parse applies as for the file results.
    const assertions = entry.assertionResults as readonly ReportAssertion[];

    if (assertions.length === 0) {
      violations.push(`${file}: collected no test cases.`);

      continue;
    }

    // A mandatory case is proven only by a reported result whose status is
    // exactly "passed". Any other state — failed, skipped, todo, pending, an
    // unrecognized value, or no status at all — is a violation, so a report the
    // runner does not fully understand can never read as a green run.
    for (const name of cases) {
      const matches = assertions.filter(
        (assertion) =>
          isNonEmptyString(assertion.fullName) && assertion.fullName === name
      );

      if (matches.length === 0) {
        violations.push(
          `${file}: mandatory case was never collected: ${name}.`
        );

        continue;
      }

      if (matches.some((assertion) => assertion.status === "passed")) continue;

      const seen = matches[0]?.status;

      if (seen === "failed") {
        violations.push(`${file}: mandatory case failed: ${name}.`);
      } else if (isNonEmptyString(seen) && NOT_EXECUTED.has(seen)) {
        violations.push(
          `${file}: mandatory case did not execute (status ${seen}): ${name}. R-20 forbids skipping it.`
        );
      } else {
        violations.push(
          `${file}: mandatory case has no passing result (reported status ${
            seen === undefined ? "absent" : JSON.stringify(seen)
          }): ${name}. Nothing is proven.`
        );
      }
    }
  }

  return violations;
}
