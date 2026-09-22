import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_TESTS,
  requiredViolations,
  type ReportAssertion,
  type ReportFileResult,
  type RequiredCase,
  type TestReport,
} from "./required-tests-guard.ts";

/**
 * The runner's own controls (R-20, AC-4): the mandatory guard must be able to
 * fail. A guard that cannot fail is decoration, and the reviewed bypass —
 * filtering the isolation case away while the command stayed green — is exactly
 * what these controls disprove, at the validator level and through the real
 * runner command line.
 *
 * The command-line cases run against synthetic workspaces under the operating
 * system's temporary directory: the manifest stays fixed in the runner, and the
 * synthetic `--config` is an ordinary vitest flag, so no invocation switch that
 * disables the manifest exists to misuse. The one real-config case below is the
 * reviewed negative control itself, which starts no container because its
 * filter matches nothing anywhere.
 */
/** One manifest entry by file, failing loudly rather than on an index guess. */
function manifestEntry(file: string) {
  const entry = REQUIRED_TESTS.find((candidate) => candidate.file === file);

  if (entry === undefined) {
    throw new Error(`No manifest entry for ${file}`);
  }

  return entry;
}

const isolation = manifestEntry("testing/isolation.integration.test.ts");

const image = manifestEntry("testing/image.startup.test.ts");

const viewer = manifestEntry("testing/viewer-background.integration.test.ts");

function reportOf(
  files: readonly {
    readonly file: string;
    readonly assertions: readonly ReportAssertion[];
  }[]
): TestReport {
  return {
    testResults: files.map((file): ReportFileResult => ({
      name: resolve("/workspace", file.file),
      assertionResults: [...file.assertions],
    })),
  };
}

/** Every manifest case, collected, executed and passed. */
function healthyReport(): TestReport {
  return reportOf(
    REQUIRED_TESTS.map((entry) => ({
      file: entry.file,
      assertions: entry.cases.map((fullName) => {
        return { fullName, status: "passed" };
      }),
    }))
  );
}

function violationFor(report: TestReport): string {
  const violations = requiredViolations(report, REQUIRED_TESTS, "/workspace");

  return violations.join(" | ");
}

describe("the manifest validator", () => {
  it("accepts a report that proves every mandatory case", () => {
    expect(violationFor(healthyReport())).toBe("");
  });

  it("fails a missing report closed", () => {
    expect(violationFor({})).toContain("malformed");
    expect(violationFor({ testResults: "not an array" })).toContain(
      "malformed"
    );
  });

  it("fails a mandatory file vitest never collected", () => {
    const withoutViewer = reportOf(
      REQUIRED_TESTS.filter((entry) => entry.file !== viewer.file).map(
        (entry) => ({
          file: entry.file,
          assertions: entry.cases.map((fullName) => ({
            fullName,
            status: "passed",
          })),
        })
      )
    );

    expect(violationFor(withoutViewer)).toContain(
      `${viewer.file}: was never collected`
    );
  });

  it("fails one removed mandatory case while another in the file remains", () => {
    const [first, second] = isolation.cases;

    const halfIsolation = reportOf([
      {
        file: isolation.file,
        assertions: [{ fullName: second ?? "", status: "passed" }],
      },
    ]);

    expect(violationFor(halfIsolation)).toContain(
      `mandatory case was never collected: ${first}`
    );
  });

  it("fails a mandatory case a filter removed from execution", () => {
    const filtered = reportOf(
      REQUIRED_TESTS.map((entry) => ({
        file: entry.file,
        assertions: entry.cases.map((fullName) => ({
          fullName,
          status: entry.file === viewer.file ? "skipped" : "passed",
        })),
      }))
    );

    expect(violationFor(filtered)).toContain("did not execute");
  });

  it("rejects todo and pending as unexecuted too", () => {
    for (const status of ["todo", "pending"]) {
      const report = reportOf(
        REQUIRED_TESTS.map((entry) => ({
          file: entry.file,
          assertions: entry.cases.map((fullName) => ({
            fullName,
            status: entry.file === viewer.file ? status : "passed",
          })),
        }))
      );

      expect(violationFor(report)).toContain("did not execute");
    }
  });

  it("fails a mandatory case that ran and failed", () => {
    const failed = reportOf(
      REQUIRED_TESTS.map((entry) => ({
        file: entry.file,
        assertions: entry.cases.map((fullName, index) => ({
          fullName,
          status:
            entry.file === isolation.file && index === 0 ? "failed" : "passed",
        })),
      }))
    );

    expect(violationFor(failed)).toContain("mandatory case failed");
  });

  it("fails a present mandatory case whose status is absent", () => {
    const absent = reportOf([
      {
        file: isolation.file,
        assertions: [{ fullName: isolation.cases[0] ?? "" }],
      },
    ]);

    expect(violationFor(absent)).toContain("no passing result");
    expect(violationFor(absent)).toContain("reported status absent");
  });

  it("fails a present mandatory case whose status is unrecognized", () => {
    const unknown = reportOf([
      {
        file: isolation.file,
        assertions: [
          { fullName: isolation.cases[0] ?? "", status: "flaky-green" },
        ],
      },
    ]);

    expect(violationFor(unknown)).toContain("no passing result");
    expect(violationFor(unknown)).toContain('"flaky-green"');
  });

  it("survives a null file entry and reports its file as never collected", () => {
    const nullEntry: TestReport = { testResults: [null] };

    const violations = requiredViolations(
      nullEntry,
      REQUIRED_TESTS,
      "/workspace"
    );

    expect(violations).toContain(
      `${isolation.file}: was never collected. A mandatory file cannot silently go missing.`
    );
  });

  it("ignores a null-named assertion without losing the real cases", () => {
    const mixed = reportOf([
      {
        file: isolation.file,
        assertions: [
          { fullName: null },
          ...isolation.cases.map((fullName) => ({
            fullName,
            status: "passed",
          })),
        ],
      },
      ...REQUIRED_TESTS.filter((entry) => entry.file !== isolation.file).map(
        (entry) => ({
          file: entry.file,
          assertions: entry.cases.map((fullName) => ({
            fullName,
            status: "passed",
          })),
        })
      ),
    ]);

    expect(violationFor(mixed)).toBe("");
  });
});

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

function runRunner(cwd: string, args: readonly string[]): number {
  const result = spawnSync("node", [RUNNER, ...args], {
    cwd,
    env: { ...process.env, GENIE_RUNNER_QUIET: "1" },
    encoding: "utf8",
  });

  return result.status ?? -1;
}

/**
 * One manifest case by index, failing loudly rather than on an undefined read.
 * The negative controls below name a case by position, so a manifest that
 * shortens its case list fails here rather than testing nothing.
 */
function manifestCase(entry: RequiredCase, index: number): string {
  const name = entry.cases[index];

  if (name === undefined) {
    throw new Error(`No case ${index} in ${entry.file}`);
  }

  return name;
}

/** One manifest case as a trivially passing top-level case. */
function passingCase(name: string): string {
  return `it(${JSON.stringify(name)}, () => {});`;
}

/** One manifest case as a skipped top-level case. */
function skippedCase(name: string): string {
  return `it.skip(${JSON.stringify(name)}, () => {});`;
}

/**
 * A trivially passing synthetic file for one manifest entry.
 *
 * The manifest records each mandatory case as its full collected name: the
 * describe and case names vitest joins with a space. The synthetic file
 * declares each of those full names as a top-level case, which vitest reports
 * with exactly that name, and the names are read from the manifest rather than
 * transcribed here. A newly required file or case therefore cannot silently
 * drift out of these controls — the failure that let the devtools-exclusion
 * entry enter the manifest while every synthetic workspace still omitted it.
 */
function passingFile(entry: RequiredCase): string {
  return entry.cases.map((name) => passingCase(name)).join("\n");
}

/** Every manifest file as a trivially passing synthetic file. */
function passingWorkspace(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    REQUIRED_TESTS.map((entry) => [entry.file, passingFile(entry)] as const)
  );
}

describe("the runner command line", () => {
  it("exits zero when every mandatory case runs and passes", () => {
    const workspace = makeWorkspace("healthy", passingWorkspace());

    try {
      expect(runRunner(workspace, ["--config", "vitest.config.mjs"])).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when one mandatory case is removed and another remains", () => {
    const workspace = makeWorkspace("half-isolation", {
      ...passingWorkspace(),
      [isolation.file]: passingCase(manifestCase(isolation, 1)),
    });

    try {
      expect(runRunner(workspace, ["--config", "vitest.config.mjs"])).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when a mandatory case is skipped in source", () => {
    const workspace = makeWorkspace("skipped-isolation", {
      ...passingWorkspace(),
      [isolation.file]: [
        skippedCase(manifestCase(isolation, 0)),
        passingCase(manifestCase(isolation, 1)),
      ].join("\n"),
    });

    try {
      expect(runRunner(workspace, ["--config", "vitest.config.mjs"])).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when a mandatory file is missing entirely", () => {
    const workspace = makeWorkspace(
      "missing-file",
      Object.fromEntries(
        Object.entries(passingWorkspace()).filter(
          ([file]) => file !== image.file
        )
      )
    );

    try {
      expect(runRunner(workspace, ["--config", "vitest.config.mjs"])).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  // The reviewed negative control, against the real configuration: a filter
  // that matches nothing anywhere skips every file, so no container starts and
  // the run must still fail here rather than report green.
  it("exits nonzero for the reviewed filtered run of the real config", () => {
    expect(
      runRunner(import.meta.dirname, [
        "testing/isolation.integration.test.ts",
        "-t",
        "__review_no_case_matches__",
      ])
    ).toBe(1);
  }, 120000);
});
