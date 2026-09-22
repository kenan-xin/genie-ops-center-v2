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
  type TestReport,
} from "./required-tests-guard.ts";

/**
 * The core integration runner's own controls (AC-6, AC-9, R-25a–R-28).
 *
 * The migrator matrix and the tenant-context containment proof are the S0-07
 * acceptance evidence, and `passWithNoTests: false` cannot see a case that was
 * filtered away while the other integration files still collect. These controls
 * prove the guard beside `tools/run-required-tests.ts` can fail — at the
 * validator level and through the real runner command line — so an
 * all-skipped or miscollected run cannot return green.
 *
 * The command-line cases run against synthetic workspaces under the operating
 * system's temporary directory: the manifest stays fixed in the runner, and the
 * synthetic `--config` is an ordinary vitest flag, so no invocation switch that
 * disables the manifest exists to misuse. The one real-config case below starts
 * no container because its filter matches nothing anywhere.
 */
/** One manifest entry by file, failing loudly rather than on an index guess. */
function manifestEntry(file: string) {
  const entry = REQUIRED_TESTS.find((candidate) => candidate.file === file);

  if (entry === undefined) {
    throw new Error(`No manifest entry for ${file}`);
  }

  return entry;
}

const migrator = manifestEntry("testing/migrator.integration.test.ts");

const tenantContext = manifestEntry(
  "testing/tenant-context.integration.test.ts"
);

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

describe("the core integration manifest validator", () => {
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
    const withoutTenantContext = reportOf(
      REQUIRED_TESTS.filter((entry) => entry.file !== tenantContext.file).map(
        (entry) => ({
          file: entry.file,
          assertions: entry.cases.map((fullName) => ({
            fullName,
            status: "passed",
          })),
        })
      )
    );

    expect(violationFor(withoutTenantContext)).toContain(
      `${tenantContext.file}: was never collected`
    );
  });

  it("fails one removed mandatory case while another in the file remains", () => {
    const [first, second] = migrator.cases;

    const halfMigrator = reportOf([
      {
        file: migrator.file,
        assertions: [{ fullName: second ?? "", status: "passed" }],
      },
    ]);

    expect(violationFor(halfMigrator)).toContain(
      `mandatory case was never collected: ${first}`
    );
  });

  it("fails a mandatory case a filter removed from execution", () => {
    const filtered = reportOf(
      REQUIRED_TESTS.map((entry) => ({
        file: entry.file,
        assertions: entry.cases.map((fullName) => ({
          fullName,
          status: entry.file === migrator.file ? "skipped" : "passed",
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
            status: entry.file === migrator.file ? status : "passed",
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
            entry.file === migrator.file && index === 0 ? "failed" : "passed",
        })),
      }))
    );

    expect(violationFor(failed)).toContain("mandatory case failed");
  });

  it("fails a present mandatory case whose status is absent", () => {
    const absent = reportOf([
      {
        file: migrator.file,
        assertions: [{ fullName: migrator.cases[0] ?? "" }],
      },
    ]);

    expect(violationFor(absent)).toContain("no passing result");
    expect(violationFor(absent)).toContain("reported status absent");
  });

  it("fails a present mandatory case whose status is unrecognized", () => {
    const unknown = reportOf([
      {
        file: migrator.file,
        assertions: [
          { fullName: migrator.cases[0] ?? "", status: "flaky-green" },
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
      `${migrator.file}: was never collected. A mandatory file cannot silently go missing.`
    );
  });

  it("ignores a null-named assertion without losing the real cases", () => {
    const mixed = reportOf([
      {
        file: migrator.file,
        assertions: [
          { fullName: null },
          ...migrator.cases.map((fullName) => ({
            fullName,
            status: "passed",
          })),
        ],
      },
      ...REQUIRED_TESTS.filter((entry) => entry.file !== migrator.file).map(
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
  const root = join(tmpdir(), `genie-core-runner-${name}`);

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

/** The migrator matrix, as a trivially passing synthetic file. */
const PASSING_MIGRATOR = `
describe("the migrator's one reserved session, watched on a real database", () => {
  it("sends the setting, the lock, every history and the cleanup through one real session", () => {});
  it("leaves the lock with the foreign session it could not take, and takes none itself (negative control)", () => {});
});

describe("the migrator against a real database", () => {
  it("applies core and then each module history on a fresh database", () => {});
  it("applies nothing the second time it runs over the same database", () => {});
  it("holds no advisory lock once a run has finished", () => {});
  it("waits for the lock, gives up at the limit and applies nothing", () => {});
  it("keeps the original error when a history fails, and blocks no later run", () => {});
});

describe("two migrator runs contending for the one lock", () => {
  it("makes the second wait, apply nothing while it waits, and finish after the release", () => {});
  it("gives the second run its lock timeout, and lets a later run finish the same plan", () => {});
});

describe("the migrator recovering from a real database failure", () => {
  it("keeps the original error and destroys the session when the connection is lost", () => {});
  it("fails the start and destroys the session when the lock is gone by cleanup time", () => {});
  it("rolls a failed history back whole, leaving no half applied table", () => {});
});

describe("the migrator over an already migrated database", () => {
  it("applies only what is missing, and applies it in registry order", () => {});
});
`;

/** The tenant-context containment proof, as a trivially passing synthetic file. */
const PASSING_TENANT_CONTEXT = `
describe("tenant context database clients", () => {
  it("keeps an error listener while a client is checked out", () => {});
  it("rejects the active query when its backend terminates", () => {});
});
`;

/** The manifest's two files, both passing. */
const PASSING_REMAINDER = {
  "testing/migrator.integration.test.ts": PASSING_MIGRATOR,
  "testing/tenant-context.integration.test.ts": PASSING_TENANT_CONTEXT,
};

describe("the core integration runner command line", () => {
  it("exits zero when every mandatory case runs and passes", () => {
    const workspace = makeWorkspace("healthy", PASSING_REMAINDER);

    try {
      expect(
        runRunner(workspace, ["--config", "vitest.config.mjs"]).status
      ).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when one mandatory case is removed and another remains", () => {
    const workspace = makeWorkspace("half-migrator", {
      "testing/migrator.integration.test.ts": `
describe("two migrator runs contending for the one lock", () => {
  it("makes the second wait, apply nothing while it waits, and finish after the release", () => {});
});
`,
      "testing/tenant-context.integration.test.ts": PASSING_TENANT_CONTEXT,
    });

    try {
      expect(
        runRunner(workspace, ["--config", "vitest.config.mjs"]).status
      ).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when a mandatory case is skipped in source", () => {
    const workspace = makeWorkspace("skipped-migrator", {
      "testing/migrator.integration.test.ts": PASSING_MIGRATOR.replace(
        '  it("makes the second wait, apply nothing while it waits, and finish after the release", () => {});',
        '  it.skip("makes the second wait, apply nothing while it waits, and finish after the release", () => {});'
      ),
      "testing/tenant-context.integration.test.ts": PASSING_TENANT_CONTEXT,
    });

    try {
      expect(
        runRunner(workspace, ["--config", "vitest.config.mjs"]).status
      ).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("exits nonzero when a mandatory file is missing entirely", () => {
    const workspace = makeWorkspace("missing-file", {
      "testing/migrator.integration.test.ts": PASSING_MIGRATOR,
    });

    try {
      expect(
        runRunner(workspace, ["--config", "vitest.config.mjs"]).status
      ).toBe(1);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  // The reviewed negative control, against the real configuration: a filter
  // that matches nothing anywhere skips every file, so no container starts and
  // the run must fail here rather than report green. The stderr assertion is
  // the point: exit 1 alone would also come from a missing config or a
  // collection error, which would not prove the skip path.
  it("exits nonzero for a filtered run of the real config, naming the skipped case", () => {
    const result = runRunner(resolve(import.meta.dirname, ".."), [
      "-t",
      "__review_no_case_matches__",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mandatory case did not execute");
    expect(result.stderr).toContain(
      "the migrator's one reserved session, watched on a real database sends the setting, the lock, every history and the cleanup through one real session"
    );
  }, 120000);
});
