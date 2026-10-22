import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REQUIRED_TESTS } from "../testing/required-tests-guard.ts";

/**
 * The module integration suite's own guard controls, beside the guarded target.
 *
 * A bare `vitest run --config vitest.integration.config.ts` cannot see a case a
 * `-t` filter removed while other files still collect, so the placeholder's
 * router and schema proof could stop running while the package reports green.
 * These controls hold the fix's contract: `test:integration` runs through the
 * required-execution runner, the module keeps its own mandatory manifest naming
 * every integration case it ships today, and the real command line enforces it.
 * The shared validator's own cases live in core's `testing/required-runner.test.ts`.
 *
 * No case here starts Postgres: the command-line case filters to a name that
 * matches nothing, so vitest collects without running a single hook.
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
  "the placeholder read procedure against a real database refuses the read with module-disabled when the placeholder entitlement is off",
  "the placeholder read procedure against a real database answers only the named record to a person with a record-scoped read grant",
  "the placeholder read procedure against a real database refuses an anonymous caller",
  "the placeholder read procedure against a real database appends placeholder:admin to Tenant administrator on enable and removes it on disable",
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
