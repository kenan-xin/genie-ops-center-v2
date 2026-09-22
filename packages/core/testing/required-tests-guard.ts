import { resolve } from "node:path";

/**
 * The core integration manifest and the validator behind it (AC-6, AC-9,
 * R-25a–R-28).
 *
 * `passWithNoTests: false` cannot see a mandatory case that was filtered away
 * while the other integration files still collected, and a suite cannot prove
 * its own execution from inside an `afterAll` that never runs when every case
 * is skipped. So the requirement is named here, outside the skippable suite, as
 * absolute case names per file: after vitest exits, the JSON report is read back
 * and every named case must have been collected, executed, and passed. Cases in
 * a required file beyond the named ones are ordinary optional coverage.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. Every entry is derived from a named acceptance clause:
 *
 * - AC-6 / R-24 / R-25 / R-28: a fresh database receives the core history and
 *   then each module history, each in its own ledger, and a second start applies
 *   nothing and applies only what is missing, in registry order.
 * - AC-9 / R-25a / R-26 / R-26a: two independent processes contend on the fixed
 *   advisory lock, the loser enters no history and proceeds only after release
 *   or fails at the lock timeout, and one backend session owns the lock, every
 *   history and the cleanup; connection loss, a failed history and uncertain
 *   cleanup preserve the original error and destroy the session.
 * - R-26a / R-27: a failed run releases or destroys the owning connection and
 *   blocks no later run. This mirrors the app harness guard in
 *   `apps/genie/testing/required-tests-guard.ts`, kept local to core so no core
 *   helper imports an app (R-39).
 */
export type RequiredCase = {
  readonly file: string;
  /** The acceptance clauses this file's cases serve, quoted in a skip violation. */
  readonly reason: string;
  readonly cases: readonly string[];
};

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/migrator.integration.test.ts",
    reason: "AC-6 and AC-9, R-25a-R-28, require the migrator matrix to run",
    cases: [
      "the migrator's one reserved session, watched on a real database sends the setting, the lock, every history and the cleanup through one real session",
      "the migrator's one reserved session, watched on a real database leaves the lock with the foreign session it could not take, and takes none itself (negative control)",
      "the migrator against a real database applies core and then each module history on a fresh database",
      "the migrator against a real database applies nothing the second time it runs over the same database",
      "the migrator against a real database holds no advisory lock once a run has finished",
      "the migrator against a real database waits for the lock, gives up at the limit and applies nothing",
      "the migrator against a real database keeps the original error when a history fails, and blocks no later run",
      "two migrator runs contending for the one lock makes the second wait, apply nothing while it waits, and finish after the release",
      "two migrator runs contending for the one lock gives the second run its lock timeout, and lets a later run finish the same plan",
      "the migrator recovering from a real database failure keeps the original error and destroys the session when the connection is lost",
      "the migrator recovering from a real database failure fails the start and destroys the session when the lock is gone by cleanup time",
      "the migrator recovering from a real database failure rolls a failed history back whole, leaving no half applied table",
      "the migrator over an already migrated database applies only what is missing, and applies it in registry order",
    ],
  },
  {
    file: "testing/tenant-context.integration.test.ts",
    reason:
      "R-26a's production cross-check, held by genie-ops-center-v2-wwc, requires the containment proof to run",
    cases: [
      "tenant context database clients keeps an error listener while a client is checked out",
      "tenant context database clients rejects the active query when its backend terminates",
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

  for (const { file, reason, cases } of required) {
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
          `${file}: mandatory case did not execute (status ${seen}): ${name}. ${reason}.`
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
