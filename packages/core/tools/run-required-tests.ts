import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  REQUIRED_TESTS,
  requiredViolations,
  type TestReport,
} from "../testing/required-tests-guard.ts";

/**
 * The core integration runner: runs vitest, then enforces the mandatory
 * manifest (AC-6, AC-9, R-25a–R-28).
 *
 * Arguments are forwarded to vitest verbatim, so this stays the only entry
 * point: `pnpm test:integration <file> -t <filter>` runs, but a filter that
 * takes a mandatory case out of execution fails the run here, in the runner,
 * where no suite-level hook can be skipped along with it. The manifest itself
 * is fixed in `required-tests-guard.ts` and has no invocation flag. This mirrors
 * the app harness runner in `apps/genie/tools/run-required-tests.ts` and stays
 * local to core so no core file imports an app (R-39).
 */
const CONFIG = "vitest.integration.config.ts";

const forwardArgs = process.argv.slice(2);

const args = forwardArgs.some((arg) => arg === "-c" || arg === "--config")
  ? forwardArgs
  : ["--config", CONFIG, ...forwardArgs];

const reportDir = mkdtempSync(join(tmpdir(), "genie-core-required-"));

const reportFile = join(reportDir, "report.json");

const vitest = resolve(import.meta.dirname, "../node_modules/.bin/vitest");

const child = spawn(
  vitest,
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

const vitestExit = await new Promise<number>((settle) => {
  // A spawn that never starts vitest emits `error` and `close`, not `exit`, so
  // this settle keeps the runner from hanging and names the real cause instead
  // of an opaque unhandled error.
  child.on("error", (error) => {
    process.stderr.write(`Could not start vitest: ${String(error)}\n`);

    settle(1);
  });

  child.on("exit", (code) => settle(code ?? 1));
});

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

const violations = requiredViolations(report, REQUIRED_TESTS, process.cwd());

if (violations.length > 0) {
  process.stderr.write(
    `The mandatory integration manifest is violated:\n${violations
      .map((line) => `  - ${line}`)
      .join("\n")}\n`
  );

  process.exit(1);
}

// Vitest failed for a reason outside the manifest, such as a failure in an
// ordinary optional case; report that exit rather than a green one.
process.exit(vitestExit);
