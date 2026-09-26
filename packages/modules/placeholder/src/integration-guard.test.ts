import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_TESTS,
  requiredViolations,
  type TestReport,
} from "../testing/required-tests-guard.ts";

/**
 * The module integration suite's own guard controls, beside the guarded target.
 *
 * A bare `vitest run --config vitest.integration.config.ts` cannot see a case a
 * `-t` filter removed while other files still collect, so the placeholder's
 * router and schema proof could stop running while the package reports green.
 * These controls hold the fix's contract: `test:integration` runs through the
 * required-execution runner, the module keeps its own mandatory manifest naming
 * every integration case it ships today, the shared validator fails a report
 * that skipped or lost a mandatory case, and the real command line enforces it.
 *
 * No case here starts Postgres: the validator cases read reports in memory, and
 * the command-line case filters to a name that matches nothing, so vitest
 * collects without running a single hook.
 */
const PACKAGE_ROOT = join(import.meta.dirname, "..");

const ROUTER_FILE = "testing/router.integration.test.ts";

/**
 * The placeholder's integration cases today, as vitest reports their full
 * names, transcribed from `testing/router.integration.test.ts`. A case added
 * there without a manifest entry fails the file-coverage and command-line
 * controls until the manifest names it.
 */
const ROUTER_CASES = [
  "the placeholder read procedure against a real database answers the rows this deployment holds",
  "the placeholder read procedure against a real database refuses a caller without the key, and reads nothing",
  "the placeholder read procedure against a real database keeps core's ledger and the module's ledger apart",
  "the placeholder read procedure against a real database recorded the module's one migration in the module's ledger",
];

function packageJson(): { scripts: Record<string, string> } {
  // SAFETY: the bytes are this package's own manifest; the one field read below
  // is asserted against an expected value rather than trusted.
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
  ) as { scripts: Record<string, string> };
}

describe("the placeholder integration guard", () => {
  it("runs test:integration through the required-execution runner", () => {
    expect(packageJson().scripts["test:integration"]).toBe(
      "node tools/run-required-tests.ts"
    );
  });

  it("keeps a runner entrypoint wired to its manifest and core's shared runner", () => {
    const entrypoint = join(PACKAGE_ROOT, "tools/run-required-tests.ts");

    expect(existsSync(entrypoint)).toBe(true);

    const runner = readFileSync(entrypoint, "utf8");

    expect(runner).toContain("runRequiredTests");
    expect(runner).toContain("required-tests-guard.ts");
    expect(runner).toContain("vitest.integration.config.ts");
    expect(runner).toContain("genie-module-placeholder-required-");
  });

  it("requires a manifest entry for every integration file the package ships", () => {
    const shipped = readdirSync(join(PACKAGE_ROOT, "testing"), {
      withFileTypes: true,
    })
      .filter(
        (entry) => entry.isFile() && entry.name.endsWith(".integration.test.ts")
      )
      .map((entry) => `testing/${entry.name}`)
      .toSorted();

    expect(REQUIRED_TESTS.map((entry) => entry.file).toSorted()).toEqual(
      shipped
    );
  });

  it("names every integration case the router proof holds today", () => {
    const router = REQUIRED_TESTS.find((entry) => entry.file === ROUTER_FILE);

    expect(router?.cases).toEqual(ROUTER_CASES);
  });
});

describe("the placeholder manifest validator", () => {
  function reportOf(
    files: readonly {
      readonly file: string;
      readonly assertions: readonly {
        readonly fullName: string;
        readonly status?: string;
      }[];
    }[]
  ): TestReport {
    return {
      testResults: files.map((file) => ({
        name: resolve(PACKAGE_ROOT, file.file),
        assertionResults: [...file.assertions],
      })),
    };
  }

  /** Every manifest case, collected, executed and passed. */
  function healthyReport(): TestReport {
    return reportOf(
      REQUIRED_TESTS.map((entry) => ({
        file: entry.file,
        assertions: entry.cases.map((fullName) => ({
          fullName,
          status: "passed",
        })),
      }))
    );
  }

  function violationsFor(report: TestReport): string {
    return requiredViolations(report, REQUIRED_TESTS, PACKAGE_ROOT).join(" ");
  }

  it("accepts a report that proves every mandatory case", () => {
    expect(violationsFor(healthyReport())).toBe("");
  });

  it("fails a mandatory case a filter removed from execution, naming it", () => {
    const filtered = reportOf([
      {
        file: ROUTER_FILE,
        assertions: ROUTER_CASES.map((fullName, index) => ({
          fullName,
          status: index === 0 ? "skipped" : "passed",
        })),
      },
    ]);

    const violations = violationsFor(filtered);

    expect(violations).toContain("did not execute");
    expect(violations).toContain(ROUTER_CASES[0] ?? "");
  });

  it("fails a mandatory file vitest never collected", () => {
    expect(violationsFor({ testResults: [] })).toContain(
      `${ROUTER_FILE}: was never collected`
    );
  });

  it("fails one removed mandatory case while its file still collects the others", () => {
    const partial = reportOf([
      {
        file: ROUTER_FILE,
        assertions: ROUTER_CASES.slice(1).map((fullName) => ({
          fullName,
          status: "passed",
        })),
      },
    ]);

    expect(violationsFor(partial)).toContain(
      `never collected: ${ROUTER_CASES[0] ?? ""}`
    );
  });
});

describe("the placeholder guard command line", () => {
  // The same negative control the core runner keeps against its real config: a
  // filter that matches nothing makes vitest report every mandatory case as
  // skipped, so the run must fail here, naming one, instead of reporting green.
  // Collection runs no hook, so no container starts.
  it("exits nonzero for a filtered run, naming the skipped case", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(PACKAGE_ROOT, "tools/run-required-tests.ts"),
        "-t",
        "__review_no_case_matches__",
      ],
      {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, GENIE_RUNNER_QUIET: "1" },
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mandatory case did not execute");
    expect(result.stderr).toContain(ROUTER_CASES[0] ?? "");
  }, 120000);
});
