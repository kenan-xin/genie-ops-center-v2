import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  requiredViolations,
  type RequiredCase,
  type TestReport,
} from "./required-tests-validator.ts";

/**
 * The integration runner: runs vitest, then enforces the mandatory manifest.
 *
 * Arguments are forwarded to vitest verbatim, so each package's entrypoint stays
 * the only way in: `pnpm test:integration <file> -t <filter>` runs, but a filter
 * that takes a mandatory case out of execution fails the run here, in the
 * runner, where no suite-level hook can be skipped along with it. The manifest
 * itself is fixed in the entrypoint's guard and has no invocation flag.
 *
 * The manifest, the vitest config name, the report-directory prefix and the
 * vitest binary are passed in, because the binary is resolved beside the calling
 * entrypoint (`../node_modules/.bin/vitest`), not here. Sharing this function is
 * what keeps the app and core harnesses from drifting apart (R-39).
 */
export type RequiredRunnerOptions = {
  readonly manifest: readonly RequiredCase[];
  readonly config: string;
  readonly reportPrefix: string;
  readonly vitestPath: string;
  readonly forwardArgs: readonly string[];
};

/** Runs the suite, enforces the manifest, and returns the exit code to use. */
export async function runRequiredTests(
  options: RequiredRunnerOptions
): Promise<number> {
  const { manifest, config, reportPrefix, vitestPath, forwardArgs } = options;

  const args = forwardArgs.some((arg) => arg === "-c" || arg === "--config")
    ? forwardArgs
    : ["--config", config, ...forwardArgs];

  const reportDir = mkdtempSync(join(tmpdir(), reportPrefix));

  const reportFile = join(reportDir, "report.json");

  const child = spawn(
    vitestPath,
    [
      "run",
      ...args,
      // The default reporter keeps the per-file list on the console; the json
      // report beside it is what the manifest validator reads back.
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${reportFile}`,
    ],
    {
      cwd: process.cwd(),
      // The runner's own controls start many short invocations and read only the
      // exit code, so they ask for silence instead of a terminal of output.
      stdio: process.env.GENIE_RUNNER_QUIET === "1" ? "ignore" : "inherit",
    }
  );

  let spawnFailed = false;

  const vitestExit = await new Promise<number>((settle) => {
    // A spawn that never starts vitest emits `error` and `close`, not `exit`, so
    // this settle keeps the runner from hanging and names the real cause instead
    // of an opaque unhandled error. There is no report to validate in that case,
    // so the branch below returns before the manifest check could add a second,
    // misleading "report is missing" violation.
    child.on("error", (error) => {
      spawnFailed = true;

      process.stderr.write(`Could not start vitest: ${String(error)}\n`);

      settle(1);
    });

    child.on("exit", (code) => settle(code ?? 1));
  });

  if (spawnFailed) {
    // Vitest never ran, so the report directory holds nothing to read; remove it
    // here rather than leak it on the way out.
    rmSync(reportDir, { recursive: true, force: true });

    return 1;
  }

  let report: TestReport;

  try {
    // SAFETY: the bytes are vitest's own report file, and the one field the
    // validator reads is re-parsed field-by-field there; a malformed payload
    // throwing here is caught into an empty report, which fails closed.
    report = JSON.parse(readFileSync(reportFile, "utf8")) as TestReport;
  } catch {
    // A missing or unparseable report proves nothing and must never read green.
    report = {};
  }

  rmSync(reportDir, { recursive: true, force: true });

  const violations = requiredViolations(report, manifest, process.cwd());

  if (violations.length > 0) {
    process.stderr.write(
      `The mandatory integration manifest is violated:\n${violations
        .map((line) => `  - ${line}`)
        .join("\n")}\n`
    );

    return 1;
  }

  // Vitest failed for a reason outside the manifest, such as a failure in an
  // ordinary optional case; report that exit rather than a green one.
  return vitestExit;
}
