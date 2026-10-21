import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { REQUIRED_TESTS } from "./required-tests-guard.ts";

/**
 * The app integration target's own fail-closed controls (R-20, AC-4).
 *
 * The shared runner and validator are proved once, in
 * `packages/core/testing/required-runner.test.ts`. This file keeps only what is
 * the app's: that its manifest and its real configuration fail the run when a
 * mandatory case is missing or filtered away, so the app's reviewed bypass stays
 * disproved against the app's own target.
 */

/** The absolute path of this runner, for spawning it as a command. */
const RUNNER = resolve(import.meta.dirname, "../tools/run-required-tests.ts");

/** One synthetic workspace: a plain-object vitest config and given test files. */
function makeWorkspace(
  name: string,
  files: Readonly<Record<string, string>>
): string {
  const root = join(tmpdir(), `genie-runner-${name}`);

  rmSync(root, { recursive: true, force: true });

  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(root, relative);

    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }

  writeFileSync(
    join(root, "vitest.config.mjs"),
    "export default { test: { globals: true, include: ['testing/**/*.test.ts'] } };",
    "utf8"
  );

  return root;
}

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

/** Every manifest file as a trivially passing synthetic file. */
function passingWorkspace(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    REQUIRED_TESTS.map(
      (entry) =>
        [
          entry.file,
          entry.cases
            .map((name) => `it(${JSON.stringify(name)}, () => {});`)
            .join("\n"),
        ] as const
    )
  );
}

/** One manifest entry by file, failing loudly rather than on an index guess. */
function manifestEntry(file: string) {
  const entry = REQUIRED_TESTS.find((candidate) => candidate.file === file);

  if (entry === undefined) {
    throw new Error(`No manifest entry for ${file}`);
  }

  return entry;
}

const image = manifestEntry("testing/image.startup.test.ts");

describe("the app integration runner fails closed", () => {
  it("exits nonzero when a mandatory file is missing from the app manifest", () => {
    const workspace = makeWorkspace(
      "missing-file",
      Object.fromEntries(
        Object.entries(passingWorkspace()).filter(
          ([file]) => file !== image.file
        )
      )
    );

    try {
      expect(
        runRunner(workspace, ["--config", "vitest.config.mjs"]).status
      ).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

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
