import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The app integration target's own fail-closed controls (R-20, AC-4).
 *
 * The shared runner and validator are proved once, in
 * `packages/core/testing/required-runner.test.ts`. This file keeps only what is
 * the app's: that its manifest and its real configuration fail the run when a
 * mandatory case is filtered away, so the app's reviewed bypass stays disproved
 * against the app's own target.
 */

/** The absolute path of this runner, for spawning it as a command. */
const RUNNER = resolve(import.meta.dirname, "../tools/run-required-tests.ts");

/** The status and stderr of one runner invocation, so a case can prove the reason. */
type RunnerResult = {
  readonly status: number;
  readonly stderr: string;
};

function runRunner(cwd: string, args: readonly string[]): RunnerResult {
  const result = spawnSync("node", [RUNNER, ...args], {
    cwd,
    env: { ...process.env, GENIE_RUNNER_QUIET: "1" },
    encoding: "utf8",
  });

  return { status: result.status ?? -1, stderr: result.stderr ?? "" };
}

describe("the app integration runner fails closed", () => {
  // The reviewed negative control, against the real app configuration: a filter
  // that matches nothing anywhere skips every file, so no container starts and
  // the run must still fail here rather than report green. The stderr assertion
  // is the point: exit 1 alone would also come from a spawn failure, which would
  // prove nothing about the app manifest.
  it("exits nonzero for the reviewed filtered run of the real app config, naming the skipped case", () => {
    // The app root, where `vitest.integration.config.ts` resolves, so the run
    // really collects the file and skips its cases rather than failing to find
    // the config and reporting a missing report.
    const result = runRunner(resolve(import.meta.dirname, ".."), [
      "testing/isolation.integration.test.ts",
      "-t",
      "__review_no_case_matches__",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mandatory case did not execute");
  }, 120000);
});
