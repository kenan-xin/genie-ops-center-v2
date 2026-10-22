import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const WORKFLOWS = ".github/workflows";

const MIGRATION_CHECK_SCRIPT = "scripts/check-migrations.mjs";

const PULL_REQUEST_TEMPLATE = ".github/pull_request_template.md";

/** A `permissions:` block: a scope map, or the `read-all`/`write-all` shorthand. */
type ReleasePermissions = string | Readonly<Record<string, string>>;

/** One `run:` step's script and one action's `uses:`, as parsed from the YAML. */
type ReleaseStep = {
  readonly uses?: string;
  readonly run?: string;
};

type ReleaseJob = {
  readonly permissions?: ReleasePermissions;
  readonly needs?: string | readonly string[];
  readonly steps?: readonly ReleaseStep[];
};

type ReleaseWorkflow = {
  readonly permissions?: ReleasePermissions;
  readonly jobs?: Readonly<Record<string, ReleaseJob>>;
};

/**
 * The release workflow parsed as YAML, so a test reads jobs and steps rather
 * than matching raw text: a comment cannot satisfy an assertion (sl1 review
 * M2). A negative check (no dependency command, no write grant) holds whatever
 * a step's `if:` or `continue-on-error:` says; a positive check asserts a step
 * exists, and a disabled one fails closed when the job runs (sl1 re-review N3).
 */
function releaseWorkflow(): ReleaseWorkflow {
  // SAFETY: `.github/workflows/release.yml` is this repository's own workflow.
  // The fields read from it are the top-level and job `permissions`, each a
  // string map or shorthand, and `steps[].uses`/`steps[].run`, each a string or
  // absent; `read` throws when the file is missing, so a typo fails rather than
  // passing vacuously.
  return parseYaml(read(`${WORKFLOWS}/release.yml`)) as ReleaseWorkflow;
}

function releaseJobs(): Readonly<Record<string, ReleaseJob>> {
  return releaseWorkflow().jobs ?? {};
}

/** The concatenated `run:` scripts of a job, for a command-presence check. */
function runText(job: ReleaseJob): string {
  return (job.steps ?? []).map((step) => step.run ?? "").join("\n");
}

/** The steps of a job that use an action, matched by its `owner/repo` prefix. */
function uses(job: ReleaseJob, action: string): readonly ReleaseStep[] {
  return (job.steps ?? []).filter(
    (step) => step.uses?.startsWith(action) ?? false
  );
}

// A run step that touches the package manager. `pnpm` covers `pnpm exec`; `nx`
// catches a bare Nx invocation. The publish jobs are held to the stricter
// allowlist below, so this denylist only guards the verify jobs (sl1 re-review
// N2).
const DEPENDENCY_COMMAND = /\bpnpm\b|\bnx\b/;

/**
 * A `permissions:` block normalized to a domain value: `write` when it grants
 * package write (`packages: write`, or the `write-all` shorthand), `none`
 * otherwise, and `undefined` when no block was declared.
 */
function packageGrant(
  block: ReleasePermissions | undefined
): "write" | "none" | undefined {
  if (block === undefined) return undefined;

  // The YAML parser hands a shorthand as a string and a scope map as an object;
  // this is the boundary that normalizes the two into one domain value.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (typeof block === "string")
    return block === "write-all" ? "write" : "none";

  return block.packages === "write" ? "write" : "none";
}

/**
 * The effective `packages` grant for a job: its own block when it declares one,
 * otherwise the workflow block. `write-all` grants every scope write, and a
 * scope absent from a map is `none` (GitHub sets unspecified scopes to none).
 */
function effectivePackages(
  workflow: ReleaseWorkflow,
  job: ReleaseJob
): "write" | "none" | undefined {
  return packageGrant(job.permissions ?? workflow.permissions);
}

/**
 * The jobs that would hold a packages: write token while running dependency
 * code: exactly the combination the split forbids. A `write-all` grant or an
 * inherited workflow-level write counts as a write (sl1 re-review N1).
 */
function dependencyJobsWithPackageWrite(
  workflow: ReleaseWorkflow
): readonly string[] {
  return Object.entries(workflow.jobs ?? {})
    .filter(
      ([, job]) =>
        DEPENDENCY_COMMAND.test(runText(job)) &&
        effectivePackages(workflow, job) === "write"
    )
    .map(([name]) => name);
}

function read(relative: string): string {
  const path = join(WORKSPACE_ROOT, relative);

  if (!existsSync(path)) {
    throw new Error(`missing ${relative}`);
  }

  return readFileSync(path, "utf8");
}

/** Every workflow file, repository-relative, so a new one is checked without a list edit. */
function workflowFiles(): readonly string[] {
  return readdirSync(join(WORKSPACE_ROOT, WORKFLOWS))
    .filter((name) => /\.ya?ml$/.test(name))
    .toSorted()
    .map((name) => `${WORKFLOWS}/${name}`);
}

/**
 * The shell text of every `run:` step: the inline value, or the indented block
 * under `run: |`. This is what the runner hands to the shell.
 */
function runScripts(workflow: string): readonly string[] {
  const lines = workflow.split("\n");
  const scripts: string[] = [];

  for (const [index, line] of lines.entries()) {
    const run = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);

    if (run === null) continue;

    const [, indent = "", inline = ""] = run;

    if (!/^[|>]/.test(inline)) {
      scripts.push(inline);

      continue;
    }

    const block: string[] = [];

    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== "" && next.search(/\S/) <= indent.length) break;

      block.push(next);
    }

    scripts.push(block.join("\n"));
  }

  return scripts;
}

/** The `actions/checkout` steps of a workflow, each with the lines under it. */
function checkoutSteps(workflow: string): readonly string[] {
  return workflow
    .split(/^(?=\s*- )/m)
    .filter((step) => /^\s*- uses: actions\/checkout@/.test(step));
}

/** The jobs of a workflow, keyed by job id, each with its full YAML text. */
function jobsOf(workflow: string): ReadonlyMap<string, string> {
  const body = workflow.split(/^jobs:\n/m)[1] ?? "";

  return new Map(
    body
      .split(/^(?= {2}[\w-]+:\n)/m)
      .filter((job) => job.trim() !== "")
      .map((job) => {
        const name =
          /^ {2}([\w-]+):$/.exec(job.split("\n")[0] ?? "")?.[1] ?? "";

        return [name, job] as const;
      })
  );
}

/** A whole-target pattern: `test` must not match inside `test:integration`. */
function targetPattern(name: string): RegExp {
  return new RegExp(`(?<![\\w:-])${name}(?![\\w:-])`);
}

type RootScripts = { readonly scripts?: Readonly<Record<string, string>> };

function rootScript(name: string): string {
  // SAFETY: the root manifest is this repository's own package.json; the two
  // fields read are checked for presence below.
  const manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
  ) as RootScripts;

  const script = manifest.scripts?.[name];

  if (script === undefined) throw new Error(`no root script ${name}`);

  return script;
}

type AppScripts = { readonly scripts?: Readonly<Record<string, string>> };

/** One script from the app manifest, which its E2E targets run. */
function appScript(name: string): string {
  // SAFETY: the app manifest is this repository's own file; the field read is
  // checked for presence below.
  const manifest = JSON.parse(read("apps/genie/package.json")) as AppScripts;

  const script = manifest.scripts?.[name];

  if (script === undefined) throw new Error(`no app script ${name}`);

  return script;
}

type AppTargets = {
  readonly nx?: {
    readonly targets?: Readonly<
      Record<string, { readonly dependsOn?: readonly string[] }>
    >;
  };
};

/** The targets one app target depends on, as its Nx configuration declares them. */
function appTargetDependsOn(name: string): readonly string[] {
  // SAFETY: the app manifest is this repository's own file; a missing target
  // or an absent dependsOn reads as an empty list, which the caller's
  // toContain fails on.
  const manifest = JSON.parse(read("apps/genie/package.json")) as AppTargets;

  return manifest.nx?.targets?.[name]?.dependsOn ?? [];
}

type CommandResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runMigrationCheck(
  args: readonly string[],
  cwd = WORKSPACE_ROOT
): CommandResult {
  const result = spawnSync(
    process.execPath,
    [join(WORKSPACE_ROOT, MIGRATION_CHECK_SCRIPT), ...args],
    {
      cwd,
      encoding: "utf8",
    }
  );

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function migrationFixture(sql: string): string {
  const root = mkdtempSync(join(tmpdir(), "genie-migration-lint-"));
  const file = join(root, "0001_contract.sql");

  writeFileSync(file, sql, "utf8");

  return file;
}

/** Runs the gate against a one-off migration holding `sql`, then removes it. */
function checkMigrationSql(sql: string): CommandResult {
  const file = migrationFixture(sql);

  try {
    return runMigrationCheck(["--migration", file, "--pg-version", "18"]);
  } finally {
    rmSync(file, { force: true });
    rmSync(join(file, ".."), { recursive: true, force: true });
  }
}

function conflictingHistoryFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "genie-migration-history-"));
  const meta = join(root, "meta");

  const snapshot = readFileSync(
    join(
      WORKSPACE_ROOT,
      "packages/modules/placeholder/drizzle/meta/0000_snapshot.json"
    ),
    "utf8"
  );

  mkdirSync(meta, { recursive: true });

  const parentId = "11111111-1111-4111-8111-111111111111";
  const leftId = "22222222-2222-4222-8222-222222222222";
  const rightId = "33333333-3333-4333-8333-333333333333";

  writeFileSync(
    join(meta, "_journal.json"),
    `${JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1,
          tag: "0000_parent",
          breakpoints: true,
        },
        { idx: 1, version: "7", when: 2, tag: "0001_left", breakpoints: true },
        { idx: 2, version: "7", when: 3, tag: "0001_right", breakpoints: true },
      ],
    })}\n`,
    "utf8"
  );

  writeFileSync(
    join(meta, "0000_parent_snapshot.json"),
    snapshot
      .replace("f65ec70f-c0b2-4c3c-b563-eec57c7c6437", parentId)
      .replace(
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000"
      ),
    "utf8"
  );
  writeFileSync(
    join(meta, "0001_left_snapshot.json"),
    snapshot
      .replace("f65ec70f-c0b2-4c3c-b563-eec57c7c6437", leftId)
      .replace("00000000-0000-0000-0000-000000000000", parentId),
    "utf8"
  );
  writeFileSync(
    join(meta, "0001_right_snapshot.json"),
    snapshot
      .replace("f65ec70f-c0b2-4c3c-b563-eec57c7c6437", rightId)
      .replace("00000000-0000-0000-0000-000000000000", parentId),
    "utf8"
  );

  return root;
}

describe("the migration pull-request gate", () => {
  it("runs one pinned migration-check script for pull requests into develop", () => {
    const workflow = read(`${WORKFLOWS}/pull-request.yml`);
    const migrationJob = jobsOf(workflow).get("migration-lint");

    // The trigger stays unfiltered so `verify` runs on every pull request —
    // including the develop -> main release pull request (genie-ops-center-v2-3ui),
    // which the workflow-wide `branches` filter used to suppress. Only the
    // migration lint is limited, by the job's own `if`.
    const [head = ""] = workflow.split(/^jobs:\n/m);

    expect(head).toContain("pull_request:");
    expect(head).not.toContain("branches:");
    expect(jobsOf(workflow).get("verify"), "the verify gate").toContain(
      "pnpm run ci:pr"
    );
    expect(migrationJob, "a migration-lint job").toBeDefined();
    expect(migrationJob).toContain("if: github.base_ref == 'develop'");
    expect(migrationJob).toMatch(
      new RegExp(
        `pnpm exec node ${MIGRATION_CHECK_SCRIPT.replaceAll(".", "\\.")}`
      )
    );
    expect(migrationJob).toContain("origin/develop");
    expect(migrationJob).toContain("git diff --name-only");
    expect(migrationJob).toContain("--migration");
    expect(migrationJob).toContain("--pg-version 18");
  });

  // Each R-13 breaking-change rule `.squawk.toml` keeps active refuses its
  // statement. The index row is the `assume_in_transaction = true` boundary:
  // that setting clears `require-concurrent-index-creation` for an index on a
  // table the same migration creates, because Drizzle applies the history in
  // one transaction, but never for an index on a table an earlier migration
  // created, the live-table case the rule exists for.
  it.each([
    ["ban-drop-column", `ALTER TABLE public.example DROP COLUMN obsolete;`],
    [
      "renaming-column",
      `ALTER TABLE public.example RENAME COLUMN old_name TO new_name;`,
    ],
    [
      "changing-column-type",
      `ALTER TABLE public.example ALTER COLUMN amount TYPE text;`,
    ],
    [
      "adding-required-field",
      `ALTER TABLE public.example ADD COLUMN email text NOT NULL;`,
    ],
    [
      "require-concurrent-index-creation",
      `CREATE INDEX "example_col_idx" ON "public"."example" USING btree ("col");`,
    ],
  ])("fails a changed migration that trips %s", (rule, sql) => {
    const result = checkMigrationSql(`${sql}\n`);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(rule);
  });

  it("accepts the same deliberate contract migration with a squawk-ignore comment", () => {
    const file = migrationFixture(
      `-- squawk-ignore ban-drop-column\nALTER TABLE public.example DROP COLUMN obsolete;\n`
    );

    try {
      const result = runMigrationCheck([
        "--migration",
        file,
        "--pg-version",
        "18",
      ]);

      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {
      rmSync(file, { force: true });
      rmSync(join(file, ".."), { recursive: true, force: true });
    }
  });

  // The rule set is `.squawk.toml`: the R-13 breaking-change rules stay active,
  // and Squawk's style defaults are excluded because drizzle-kit generates
  // `CREATE TABLE` with no `IF NOT EXISTS` and no timeout settings. A real
  // generated history is the proof that a normal module migration stays green.
  it("passes a generated migration that only trips Squawk's style defaults", () => {
    const result = runMigrationCheck([
      "--migration",
      "packages/modules/placeholder/drizzle/0000_boring_gargoyle.sql",
      "--pg-version",
      "18",
    ]);

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  // Squawk's remedy for a live-table index is CONCURRENTLY, but the migrator
  // runs each history in one transaction and Postgres refuses CONCURRENTLY
  // there, so the gate refuses it outright rather than let a migration pass CI
  // and fail at container start (R-27). Only the forms Postgres refuses inside a
  // transaction block are refused; matching the bare word refused a legal
  // `REFRESH MATERIALIZED VIEW CONCURRENTLY` (1ia.1 review L7). One row per
  // statement kind, each spelled with the case, spacing, line break or optional
  // clause the statement match must tolerate.
  it.each([
    `CREATE INDEX CONCURRENTLY "example_col_idx" ON "public"."example" USING btree ("col");`,
    `create   unique index   concurrently if not exists "example_col_idx" on "public"."example" ("col");`,
    `drop   index\nconcurrently   if   exists "public"."example_col_idx";`,
    `REINDEX INDEX CONCURRENTLY "example_col_idx";`,
    `reindex   table   concurrently   "public"."example";`,
    `alter table "public"."example" detach   partition "public"."example_2024"   concurrently;`,
  ])("refuses the CONCURRENTLY form %#", (sql) => {
    const result = checkMigrationSql(sql);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/CONCURRENTLY/);
    expect(result.stdout + result.stderr).toMatch(/transaction/i);
  });

  // The refusal is per statement: a CONCURRENTLY in a later statement must not
  // fail an earlier CONCURRENTLY-free partition detach.
  it("does not let a later CONCURRENTLY statement trip a partition detach", () => {
    const result = checkMigrationSql(
      `-- squawk-ignore require-concurrent-partition-detach\n` +
        `ALTER TABLE "public"."example" DETACH PARTITION "public"."example_2024";\n` +
        `REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."example_mv";\n`
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  // A real migration carries the word in the squawk-ignore justification the
  // refusal asks for, so a comment-only match would fail the author twice.
  it("passes a migration whose comment mentions CONCURRENTLY", () => {
    const result = checkMigrationSql(
      `-- A plain index; the migrator's transaction forbids CONCURRENTLY.\n` +
        `CREATE TABLE "public"."example" ("id" uuid PRIMARY KEY);\n`
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  // Postgres runs this form inside a transaction, unlike the index forms above.
  it("passes REFRESH MATERIALIZED VIEW CONCURRENTLY", () => {
    const result = checkMigrationSql(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."example_mv";\n`
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("ignores CONCURRENTLY inside a string literal", () => {
    const result = checkMigrationSql(
      `CREATE TABLE "public"."example" ("note" text DEFAULT 'CONCURRENTLY');\n`
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("rejects two snapshots that fork from one migration history parent", () => {
    const folder = conflictingHistoryFixture();

    try {
      const result = runMigrationCheck(["--history", folder]);

      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(
        /drizzle-kit|prevId|history|migration history/i
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("requires reviewers to confirm the expand/contract release gap", () => {
    const template = read(PULL_REQUEST_TEMPLATE);

    expect(template).toMatch(
      /\[[ x]\].*contract migration.*at least one release after.*expand/i
    );
  });
});

/**
 * R-51's CI gates, held as a wiring check.
 *
 * The workflows cannot be executed here, so this asserts the exact triggers and
 * commands they must carry, and — the part that matters most — that no workflow
 * contains a bare `docker push`. Every publish goes through the customer or
 * development wrapper, which is the only place that smoke-checks the candidate
 * and pushes the exact smoke-tested identity.
 */
describe("the Spec 0 CI gates", () => {
  // A workflow step runs in a plain shell, where the workspace binaries are not
  // on PATH, so a bare `nx` exits 127 (develop run 35938781955). Inside a pnpm
  // script it worked, which is why the single-job workflow never showed it.
  it("calls nx through pnpm exec in every workflow step", () => {
    for (const file of workflowFiles()) {
      for (const script of runScripts(read(file))) {
        for (const command of script.split(/&&|\|\||;|\n/)) {
          expect(command.trim(), `${file}: ${command.trim()}`).not.toMatch(
            /^nx\s/
          );
        }
      }
    }
  });

  // Spec 2 S2-16 (tech plan D2-2): the real Entra run is scheduled and manual, never a pull-request
  // check or a merge gate, and a missing secret skips it with a notice instead of failing.
  it("runs the Entra suite on a schedule and by hand, and skips without its secret", () => {
    // SAFETY: the repository's own workflow; `on`, the job steps' `run`, `if` and `env` are read.
    const workflow = parseYaml(read(`${WORKFLOWS}/entra-scheduled.yml`)) as {
      readonly on: {
        readonly schedule?: readonly { readonly cron: string }[];
        readonly workflow_dispatch?: null;
      };
      readonly jobs: Readonly<
        Record<
          string,
          {
            readonly steps: readonly {
              readonly run?: string;
              readonly if?: string;
              readonly env?: { readonly ENTRA_TEST_TENANT: string };
            }[];
          }
        >
      >;
    };

    expect(Object.keys(workflow.on).toSorted()).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);

    const [guard, ...rest] = workflow.jobs["entra"]?.steps ?? [];

    expect(guard?.run).toContain('-z "$ENTRA_TEST_TENANT"');
    expect(guard?.run).toContain("::notice");
    expect(rest.length).toBeGreaterThan(0);

    for (const step of rest) {
      expect(step.if).toBe("steps.secret.outputs.configured == 'true'");
    }

    // The secret reaches the guard and the suite step only, never an install or setup step.
    const text = read(`${WORKFLOWS}/entra-scheduled.yml`);
    const [head = "", jobs = ""] = text.split(/^jobs:\n/m);

    expect(head).not.toContain("secrets.");
    expect(
      jobs.split("\n").filter((line) => line.includes("secrets."))
    ).toHaveLength(2);
    expect(guard?.env).toEqual({
      ENTRA_TEST_TENANT: "${{ secrets.ENTRA_TEST_TENANT }}",
    });
    expect(
      rest.filter((step) => step.env !== undefined).map((step) => step.run)
    ).toEqual(["pnpm exec nx run @genie/app:test:e2e:entra"]);

    for (const name of ["pull-request", "develop", "release"]) {
      expect(read(`${WORKFLOWS}/${name}.yml`), name).not.toContain("e2e:entra");
    }
  });

  // genie-ops-center-v2-bf7: the affected base used to be the pushed commit's
  // parent (`github.event.before`). With `cancel-in-progress: true`, push B
  // cancels the run for push A and gates only A→B — so if A's run was cancelled
  // or failed, the projects A touched are never gated on develop. The base must
  // be the last *successful* develop run instead: nrwl/nx-set-shas (v2+) reads
  // the workflow's own run history through the GitHub API, which needs
  // `actions: read`, and exports it as the NX_BASE the affected commands use.
  it("bases every develop affected run on the last successful develop run", () => {
    const workflow = read(`${WORKFLOWS}/develop.yml`);
    const [head = ""] = workflow.split(/^jobs:\n/m);

    // The push parent must be gone in every form: the `github.event.before`
    // expression and the all-zero first-push marker that only made sense as
    // its fallback.
    expect(workflow).not.toContain("github.event.before");
    expect(workflow).not.toContain("0000000000000000000000000000000000000000");

    // v2+ of the action looks the run history up through the GitHub API, so
    // the token needs `actions: read`; the workflow stays otherwise read-only.
    expect(
      head,
      "the workflow grants actions: read for the run-history lookup"
    ).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read\n/m);

    // Every affected job is a runner of its own, so each one derives NX_BASE
    // itself. The major is pinned so an upgrade is a deliberate edit, and
    // `main-branch-name: develop` points the lookup at this gate branch — the
    // action would otherwise default to main.
    for (const [name, job] of jobsOf(workflow)) {
      if (!runScripts(job).join("\n").includes("nx affected")) continue;

      // Pinned to a commit SHA with its major named, so an upgrade is a
      // deliberate edit (genie-ops-center-v2-sl1); the global pinning test
      // above proves the SHA and version comment on every action.
      const shas = [
        ...job.matchAll(/uses: nrwl\/nx-set-shas@[0-9a-f]{40} # v5\.\d+\.\d+/g),
      ];

      expect(
        shas,
        `${name} derives its base from the last successful develop run`
      ).toHaveLength(1);
      expect(job, `${name} reads develop's run history, not main's`).toContain(
        "main-branch-name: develop"
      );

      // A history with no successful run yet — the first push — falls back to
      // git's empty tree, so every project is affected rather than an empty
      // range (the property the old zero-SHA branch carried).
      expect(job, `${name} falls back to git's empty tree`).toContain(
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
      );
    }
  });

  // One runner per heavy suite. Today's single verify job serializes the fast
  // gates behind the image-building integration suites and the browser E2E
  // suites, so a merge commit waits for the slowest chain
  // (genie-ops-center-v2-ejs). The gates keep one job; the app and Storybook
  // integration suites each get their own runner — on one 4-vCPU runner the
  // app's Docker builds competed with the Storybook browser matrix (develop
  // run 35893905134) — and the E2E suites get theirs. Requiring each heavy job
  // to `needs: gates` is accepted here: the gates fail fast before any heavy
  // suite spends runner time, and the heavy suites still run beside each other.
  it("splits the develop merge gates into parallel jobs", () => {
    const workflow = read(`${WORKFLOWS}/develop.yml`);
    const jobs = jobsOf(workflow);
    const [head = ""] = workflow.split(/^jobs:\n/m);

    expect(head, "the merge gates run on pushes to develop").toMatch(
      /branches:\n\s+- develop\n/
    );

    // No develop job runs the serial monolith scripts any more; ci:pr stays
    // the pull-request path only.
    expect(workflow).not.toContain("pnpm run ci:develop");
    expect(workflow).not.toContain("pnpm run ci:pr");

    const gates = jobs.get("gates");

    expect(gates, "a gates job").toBeDefined();

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build",
      "build-storybook",
      "test-storybook",
      "validate",
    ]) {
      expect(gates, `the gates job runs ${target}`).toMatch(
        targetPattern(target)
      );
    }

    // The gates job stays fast: no image suite, no browser suite.
    expect(gates).not.toMatch(/test:integration|test:e2e/);

    const integrationJobs = [...jobs.entries()].filter(([, job]) =>
      job.includes("test:integration")
    );

    expect(
      integrationJobs.length,
      "the heavy suites split across jobs"
    ).toBeGreaterThanOrEqual(2);

    // genie-ops-center-v2-bf7: the suites are one matrix job whose roster is
    // projected from the workspace at run time, so each discovered project —
    // the app and Storybook included — gets its own runner and a new module is
    // picked up without a develop.yml edit.
    const discover = jobs.get("integration-discover");
    const integration = jobs.get("integration");

    expect(
      discover,
      "a job discovers the affected integration projects"
    ).toBeDefined();
    expect(integration, "an integration matrix job").toBeDefined();
    expect(
      integration,
      "the matrix fans out one runner per discovered project"
    ).toContain(
      "project: ${{ fromJSON(needs.integration-discover.outputs.projects) }}"
    );
    expect(
      integration,
      "one failed project does not cancel its siblings"
    ).toContain("fail-fast: false");

    const e2eJob = [...jobs.entries()].find(([, job]) =>
      job.includes("test:e2e")
    );

    expect(e2eJob, "a job runs the E2E suites").toBeDefined();

    // The fixture suite runs once, in the app's integration shard through the
    // test:integration dependency, so the E2E job runs only the ordinary suite.
    const e2eScripts = runScripts(e2eJob?.[1] ?? "").join("\n");

    expect(
      e2eScripts.search(targetPattern("test:e2e")),
      "the E2E job runs the ordinary suite"
    ).toBeGreaterThan(-1);
    expect(
      e2eScripts.search(targetPattern("test:e2e:fixture")),
      "the E2E job does not repeat the fixture suite"
    ).toBe(-1);

    // Every heavy job waits for the gates, so a broken lint fails before any
    // image build spends runner time.
    const heavyJobs = [...integrationJobs, ...(e2eJob ? [e2eJob] : [])];

    for (const [name, job] of heavyJobs) {
      expect(job, `${name} waits for the gates`).toMatch(
        /^ {4}needs:(?: gates| \[gates\]|\n {6}- gates)\n/m
      );
    }
  });

  // Affected filtering: a push that touches no project must run no heavy
  // suite, so the discover job projects the affected integration set with
  // `nx show projects --affected -t test:integration --base="$NX_BASE"` — an
  // unconditional `nx run-many` runs every suite on every push (reviewed on
  // 57bfc26). The base itself — the last successful develop run, not the push
  // parent (genie-ops-center-v2-bf7) — is pinned by the dedicated base test
  // above.
  it("filters every develop integration job through the affected set", () => {
    const jobs = jobsOf(read(`${WORKFLOWS}/develop.yml`));

    // genie-ops-center-v2-bf7: the roster is projected from the affected set
    // once, in the discover job, and the matrix runs one shard per project it
    // prints. A push that touches no integration project yields `[]`, the
    // matrix is skipped, and no suite runs.
    const discover = jobs.get("integration-discover");

    expect(discover, "an integration-discover job").toBeDefined();

    const discoverScripts = runScripts(discover ?? "").join("\n");

    // genie-ops-center-v2-bf7: the roster is the affected projection of the
    // workspace's own `test:integration` query, so a module that declares the
    // target is covered the day it lands. A fixed roster — `--exclude='*,!@genie/app'`
    // and friends — is exactly the staleness bug: it names today's projects
    // and silently drops the next module's.
    expect(
      discoverScripts,
      "the discover job derives its project list from the workspace"
    ).toContain("nx show projects --affected -t test:integration");
    expect(
      discoverScripts,
      "the discover job carries no fixed project roster"
    ).not.toMatch(/--exclude=\S*!/);
    expect(
      discoverScripts,
      "the discover job bases the affected range on NX_BASE"
    ).toMatch(/--base=["{]?\$NX_BASE/);

    const integration = jobs.get("integration");

    expect(integration, "an integration matrix job").toBeDefined();

    const integrationScripts = runScripts(integration ?? "").join("\n");

    expect(
      integrationScripts,
      "the matrix job never runs every suite unconditionally"
    ).not.toContain("nx run-many");
    expect(
      integrationScripts,
      "the matrix job runs the project the discover job handed it"
    ).toContain("test:integration");

    // Each shard keeps the shared-runner rules: a bail stops the run once the
    // project fails (develop run 35867486208), and the projects never compete
    // for the runner's 4 vCPUs (develop runs 35893905134 and 35932712679).
    expect(
      integrationScripts,
      "the matrix bails its integration run"
    ).toContain("--nx-bail");
    expect(
      integrationScripts,
      "the matrix runs its projects one at a time"
    ).toContain("--parallel=1");

    // The E2E job stays unconditional: ci:develop always ran both browser
    // suites regardless of the affected set, so the deployable image is
    // proved end to end on every merge.
    const e2eJob = jobs.get("e2e");

    expect(e2eJob, "an e2e job").toBeDefined();
    expect(
      e2eJob,
      "the e2e job never filters through the affected set"
    ).not.toContain("nx affected");
  });

  // Superseded runs: every push to an open pull request and every merge to
  // develop cancels the previous run on the same ref, so a burst of pushes
  // does not queue a wall of redundant runner hours (genie-ops-center-v2-ejs).
  it("cancels the superseded pull-request and develop runs", () => {
    for (const name of ["pull-request", "develop"]) {
      const workflow = read(`${WORKFLOWS}/${name}.yml`);
      const [head = ""] = workflow.split(/^jobs:\n/m);

      // Top-level, so it applies to every job the workflow declares.
      expect(head, `${name} declares a concurrency group`).toMatch(
        /^concurrency:\n/m
      );

      // The group carries a ref, so two branches never share a group, and a
      // workflow name — the expression or the workflow's own name — so the
      // two workflows on one pull request never cancel each other.
      const group = /^ {2}group: (.*)$/m.exec(head)?.[1] ?? "";

      expect(group, `${name} groups by ref`).toContain("github.ref");
      expect(
        /github\.workflow/.test(group) ||
          /[A-Za-z]/.test(group.replace(/\$\{\{[^}]*\}\}/g, "")),
        `${name} groups by workflow`
      ).toBe(true);

      expect(head, `${name} cancels in progress`).toMatch(
        /^ {2}cancel-in-progress: true$/m
      );
    }
  });

  // A release tag is never superseded: there is no newer tag run to cancel it
  // in favour of, and a cancelled publish could strand a half-pushed image.
  it("never cancels a release run", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);

    expect(workflow).not.toMatch(/cancel-in-progress:\s*true/);
  });

  // genie-ops-center-v2-sl1 and -3ui: a release tag must be the squash commit of
  // one merged develop-to-main pull request (owner decision 2026-10-20), and that
  // pull request's develop head must have a successful develop.yml push run. The
  // squash commit on main never gets a develop run of its own.
  it("refuses a release tag that is not a main squash commit with a green develop head", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);
    const discover = jobsOf(workflow).get("discover");

    expect(discover, "a discover job").toBeDefined();

    // Reading the run history through the Actions API needs `actions: read`;
    // the job stays otherwise read-only.
    expect(
      discover,
      "the discover job grants actions: read for the run-history lookup"
    ).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}actions: read\n/m);

    const scripts = runScripts(discover ?? "").join("\n");

    // Fail closed: a tag the lookup cannot prove exits nonzero. The gh and jq
    // filters themselves are not pinned as text, which would fail a working
    // rewrite and pass a broken filter.
    expect(scripts).toContain("exit 1");

    expect(discover, "full history so origin/main exists").toMatch(
      /fetch-depth: 0/
    );
    expect(
      discover,
      "the pull-request lookup needs pull-requests: read"
    ).toMatch(/^ {6}pull-requests: read\n/m);

    // A release starts from a version tag only, and the development image is
    // the branch taken when no customer exists.
    expect(workflow).toMatch(/tags:\n\s+- "v\*"\n/);
    expect(workflow).toContain("needs.discover.outputs.customers == '[]'");
  });

  // genie-ops-center-v2-sl1 and -dwn: docker/login-action writes a
  // packages:write token to ~/.docker/config.json. A job that ran dependency
  // code (pnpm install, Nx) can leave a process behind that reads it, so no
  // such job may hold a write grant — not its own, not inherited from the
  // workflow, and not `write-all`. The workflow is parsed as YAML (sl1 review
  // M2); a negative check holds whatever `if:` or `continue-on-error:` a step
  // carries, and a positive check that a disabled step would fail closed when
  // the job runs (sl1 re-review N3).
  describe("the release credential boundary", () => {
    it("gives no dependency job a package write grant", () => {
      const workflow = releaseWorkflow();

      expect(
        Object.entries(workflow.jobs ?? {})
          .filter(([, job]) => job.permissions === undefined)
          .map(([name]) => name),
        "every release job declares its own permissions"
      ).toEqual([]);

      expect(
        dependencyJobsWithPackageWrite(workflow),
        "no job that runs pnpm or Nx may hold packages: write"
      ).toEqual([]);
    });

    // A `write-all` grant is not a scope map, and a job without a block
    // inherits the workflow's. Both slipped past the old check; this pins that
    // the computed grant catches them (sl1 re-review N1).
    it("catches a write-all verify job and a verify job with no block", () => {
      const jobs = releaseJobs();
      const verify = jobs["verify-customers"];

      if (verify === undefined) throw new Error("no verify-customers job");

      const writeAll: ReleaseWorkflow = {
        permissions: { contents: "read" },
        jobs: {
          ...jobs,
          "verify-customers": { ...verify, permissions: "write-all" },
        },
      };

      expect(
        dependencyJobsWithPackageWrite(writeAll),
        "write-all is a write grant"
      ).toContain("verify-customers");

      const noBlock: ReleaseWorkflow = {
        permissions: { contents: "read" },
        jobs: {
          ...jobs,
          "verify-customers": { steps: verify.steps ?? [] },
        },
      };

      expect(
        Object.entries(noBlock.jobs ?? {})
          .filter(([, job]) => job.permissions === undefined)
          .map(([name]) => name),
        "an undeclared block is caught"
      ).toContain("verify-customers");

      // A job with no block inherits the workflow's grant, so a workflow-level
      // `packages: write` reaches a dependency job that declares nothing.
      const inherited: ReleaseWorkflow = {
        permissions: { packages: "write" },
        jobs: {
          ...jobs,
          "verify-customers": { steps: verify.steps ?? [] },
        },
      };

      expect(
        dependencyJobsWithPackageWrite(inherited),
        "a workflow-level write is inherited"
      ).toContain("verify-customers");
    });

    it("publishes from a separate job that only loads and promotes", () => {
      const workflow = releaseWorkflow();
      const jobs = workflow.jobs ?? {};

      const publishing = Object.entries(jobs).filter(
        ([, job]) => uses(job, "docker/login-action").length > 0
      );

      // One publish job per path: the customer matrix and the development one.
      expect(publishing.length, "one publishing job per path").toBe(2);

      // The credential job's whole surface is an allowlist, not a denylist of
      // known package managers: an unlisted action or command fails the test
      // even if it never mentions pnpm or nx (sl1 re-review N2).
      const ALLOWED_ACTIONS = [
        "actions/checkout",
        "actions/setup-node",
        "actions/download-artifact",
        "docker/login-action",
      ] as const;

      for (const [name, job] of publishing) {
        expect(
          effectivePackages(workflow, job),
          `${name} holds the package grant`
        ).toBe("write");

        const actions = (job.steps ?? []).flatMap((step) =>
          step.uses === undefined ? [] : [step.uses]
        );

        for (const action of actions) {
          expect(
            ALLOWED_ACTIONS.some((allowed) => action.startsWith(allowed)),
            `${name} uses only the allowed actions (${action})`
          ).toBe(true);
        }

        for (const allowed of ALLOWED_ACTIONS) {
          expect(
            uses(job, allowed).length,
            `${name} uses ${allowed} exactly once`
          ).toBe(1);
        }

        for (const step of job.steps ?? []) {
          if (step.run === undefined) continue;

          const loads = /zstd -dc\b[^\n]*\|\s*docker load/.test(step.run);

          const promotes =
            step.run.includes("scripts/build-") &&
            step.run.includes("--publish-digest");

          expect(
            loads || promotes,
            `${name} runs only a load or a promote: ${step.run}`
          ).toBe(true);
        }
      }

      // Every job that is not a publisher stays without a write grant.
      for (const [name, job] of Object.entries(jobs)) {
        if (publishing.some(([published]) => published === name)) continue;

        expect(
          effectivePackages(workflow, job),
          `${name} holds no write grant`
        ).not.toBe("write");
      }
    });

    it("hands the published identity over from the verify job, never a shared temp file", () => {
      const jobs = releaseJobs();

      // The single development job has one verify instance, so GitHub can carry
      // its identity as a job output — bound by the runner, not a file the
      // publish job re-reads from a shared lane.
      const developmentPublish = JSON.stringify(
        jobs["publish-development"]?.steps ?? []
      );

      expect(
        developmentPublish,
        "the development publish reads the verify job output"
      ).toContain("needs.verify-development.outputs.identity");
      expect(
        developmentPublish,
        "the development publish re-reads no shared temp file"
      ).not.toContain("RUNNER_TEMP");

      // The customer path is a matrix, and GitHub resolves a matrix job's
      // `outputs` to the last instance that finished, so a per-slug identity
      // cannot be a job output. It travels in the artifact the verify job
      // uploaded, which the matching publish job downloads.
      const customerPublish = jobs["publish-customers"] ?? {};

      expect(
        uses(customerPublish, "actions/download-artifact").length,
        "the customer publish downloads the verify artifact"
      ).toBe(1);
      expect(
        runText(customerPublish),
        "the customer publish reads the identity the verify job wrote"
      ).toContain("candidate/identity");
    });

    it("verifies with no package grant and uploads the smoked image", () => {
      const workflow = releaseWorkflow();

      for (const name of ["verify-customers", "verify-development"]) {
        const job = workflow.jobs?.[name];

        expect(job, `a ${name} job`).toBeDefined();
        expect(
          effectivePackages(workflow, job ?? {}),
          `${name} holds no write grant`
        ).not.toBe("write");

        const scripts = runText(job ?? {});

        expect(scripts, `${name} smokes without publishing`).toContain(
          "--no-publish"
        );
        expect(scripts, `${name} writes the smoked identity`).toContain(
          "--identity-out candidate/identity"
        );
        expect(scripts, `${name} saves the smoked image`).toContain(
          "docker save"
        );
        expect(
          uses(job ?? {}, "actions/upload-artifact").length,
          `${name} uploads the candidate`
        ).toBe(1);
        expect(scripts, `${name} never logs in`).not.toContain("docker/login");
      }
    });
  });

  // genie-ops-center-v2-sl1 (M5): a retagged third-party action in a
  // packages:write job can publish, and a movable base image can change under a
  // build. Every action is pinned to a full commit SHA with its version named.
  it("pins every workflow action to a commit SHA with its version", () => {
    const pin =
      /^\s*(?:- )?uses:\s+[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/;

    for (const file of workflowFiles()) {
      for (const [index, line] of read(file).split("\n").entries()) {
        if (!/^\s*(?:- )?uses:/.test(line)) continue;

        expect(pin.test(line), `${file}:${index + 1}: ${line.trim()}`).toBe(
          true
        );
      }
    }
  });

  // The Dockerfile and its build context are part of the release supply chain:
  // the base image must be immutable, the runtime must not run as root, and a
  // local .env must not be baked into the image (genie-ops-center-v2-sl1).
  describe("the release supply chain", () => {
    it("pins the runtime base image by digest, keeping the tag for readability", () => {
      const froms = read("deploy/Dockerfile")
        .split("\n")
        .filter((line) => line.startsWith("FROM "));

      expect(froms.length, "both stages").toBeGreaterThanOrEqual(2);

      for (const from of froms) {
        expect(from, from).toMatch(
          /^FROM node:26-alpine@sha256:[0-9a-f]{64} AS \w+$/
        );
      }
    });

    it("runs the runtime stage as the non-root node user", () => {
      const runtime = read("deploy/Dockerfile")
        .split(/^FROM /m)
        .find((stage) =>
          /^node:26-alpine@sha256:[0-9a-f]{64} AS runtime\b/.test(stage)
        );

      expect(runtime, "a runtime stage").toBeDefined();
      expect(runtime).toMatch(/^USER node$/m);

      // The user switch must follow the asset placement, or the container
      // still starts as root.
      const userAt = runtime?.indexOf("USER node") ?? -1;
      const assetsAt = runtime?.indexOf("cp -r /staging/static") ?? -1;

      expect(userAt).toBeGreaterThan(assetsAt);
    });

    it("keeps local environment files out of the build context", () => {
      expect(read(".dockerignore")).toMatch(/^\*\*\/\.env\*$/m);
    });
  });

  // Least privilege: every workflow starts read-only, so a new job cannot
  // inherit a write token by accident. Only the release publishing jobs write.
  it("declares read-only top-level permissions in every workflow", () => {
    const files = workflowFiles();

    expect(files.length).toBeGreaterThan(2);

    for (const file of files) {
      const workflow = read(file);
      const [head = ""] = workflow.split(/^jobs:\n/m);

      expect(head, file).toMatch(/^permissions:\n {2}contents: read\n/m);

      // Only the release publishing jobs write, and only packages; which job
      // may hold that grant is the parsed credential boundary above.
      const grants = workflow
        .split("\n")
        .filter((line) => /:\s*write\s*$/.test(line))
        .map((line) => line.trim());

      expect(grants, file).toEqual(
        file.endsWith("/release.yml") ? grants.map(() => "packages: write") : []
      );
    }
  });

  // Script injection: an expression expanded into `run:` text is pasted into
  // the shell before it runs, so a crafted tag name could execute. Values reach
  // the shell through `env:` and are quoted there as ordinary variables.
  it("expands no github or matrix expression inside a run script", () => {
    for (const file of workflowFiles()) {
      for (const script of runScripts(read(file))) {
        expect(script, file).not.toMatch(/\$\{\{\s*(github|matrix)\./);
      }
    }
  });

  // A hosted runner has no browser. Storybook component tests and the E2E suites
  // launch Chromium, so every job that runs gates installs the pinned browser after
  // the dependencies and before the gates (genie-ops-center-v2-1rd.12.2).
  it("installs the pinned Playwright Chromium before any gate runs", () => {
    // A gate is the pull-request ci run or a release verify build. The
    // `--no-publish` build is the verify job's; the publish job's
    // `--publish-digest` promote is not a gate and installs no browser.
    const gate = /run: pnpm run ci:|run: scripts\/build-[^\n]*--no-publish/;

    // pull-request and release keep one serial gate job each, so the install
    // still precedes that single gate.
    for (const name of ["pull-request", "release"]) {
      const lines = read(`${WORKFLOWS}/${name}.yml`).split("\n");

      const gates = lines.flatMap((line, index) =>
        gate.test(line) ? [index] : []
      );

      expect(gates.length, name).toBeGreaterThan(0);

      for (const at of gates) {
        const before = lines.slice(0, at);

        const install = before.findLastIndex((line) =>
          line.includes("pnpm install --frozen-lockfile")
        );

        const browser = before.findLastIndex((line) =>
          line.includes("pnpm exec playwright install --with-deps chromium")
        );

        expect(
          install,
          `${name}:${at + 1} installs dependencies`
        ).toBeGreaterThan(-1);
        expect(
          browser,
          `${name}:${at + 1} installs the browser after the dependencies`
        ).toBeGreaterThan(install);
      }
    }

    // develop splits into jobs, and every one of those jobs runs a gate that
    // launches the pinned Chromium on the host: test-storybook under the gates
    // and the Storybook integration suite, Playwright under the E2E suites.
    // Each such job installs the browser after its dependencies and before
    // its first gate.
    for (const [jobName, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      const scripts = runScripts(job).join("\n");

      // Only the jobs that actually run a browser suite install the browser;
      // the discover job merely projects the integration roster.
      if (
        !/nx (?:affected|run-many|run)\b[^\n]*test[:-](?:storybook|e2e|integration)/.test(
          scripts
        )
      )
        continue;

      const install = job.indexOf("pnpm install --frozen-lockfile");

      const browser = job.indexOf(
        "pnpm exec playwright install --with-deps chromium"
      );

      const firstGate = Math.min(
        ...[...job.matchAll(/run:.*\bnx (?:affected|run-many|run)\b/g)].map(
          (match) => match.index ?? 0
        )
      );

      expect(
        install,
        `develop ${jobName} installs dependencies`
      ).toBeGreaterThan(-1);
      expect(
        browser,
        `develop ${jobName} installs the browser after the dependencies`
      ).toBeGreaterThan(install);
      expect(
        browser,
        `develop ${jobName} installs the browser before its first gate`
      ).toBeLessThan(firstGate);
    }
  });

  // The image suites build many full app images on one hosted runner, and the
  // default runner ran out of disk inside `pnpm install` (release run
  // 35865015903). Every job that runs gates frees the preinstalled toolchains
  // first (genie-ops-center-v2-1rd.12.2).
  it("frees runner disk space before any gate runs", () => {
    // A gate is the pull-request ci run or a release verify build. The
    // `--no-publish` build is the verify job's; the publish job's
    // `--publish-digest` promote is not a gate and installs no browser.
    const gate = /run: pnpm run ci:|run: scripts\/build-[^\n]*--no-publish/;

    // pull-request and release keep one serial gate job each, so the cleanup
    // still precedes that single gate.
    for (const name of ["pull-request", "release"]) {
      const lines = read(`${WORKFLOWS}/${name}.yml`).split("\n");

      const gates = lines.flatMap((line, index) =>
        gate.test(line) ? [index] : []
      );

      expect(gates.length, name).toBeGreaterThan(0);

      for (const at of gates) {
        const job = lines.slice(0, at);

        const start = job.findLastIndex((line) => /^ {2}[\w-]+:$/.test(line));

        const freed = job
          .slice(start)
          .some((line) =>
            line.includes(
              "rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc"
            )
          );

        expect(freed, `${name}:${at + 1} frees disk space in its job`).toBe(
          true
        );
      }
    }

    // develop splits into jobs, and the disk-hungry ones — the integration
    // suites and the E2E suites, which build full Docker images (build-image,
    // build-fixture-image) — free the toolchains in their own job before the
    // builds start. The gates job builds no image and needs none of this.
    for (const [jobName, job] of jobsOf(read(`${WORKFLOWS}/develop.yml`))) {
      const scripts = runScripts(job).join("\n");

      // Only the jobs that actually build an image need the cleanup; the
      // discover job merely projects the integration roster.
      if (
        !/nx (?:affected|run-many|run)\b[^\n]*test[:-](?:integration|e2e)/.test(
          scripts
        )
      )
        continue;

      const freed = job.indexOf(
        "rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc"
      );

      const firstGate = Math.min(
        ...[...job.matchAll(/run:.*\bnx (?:affected|run-many|run)\b/g)].map(
          (match) => match.index ?? 0
        )
      );

      expect(
        freed,
        `develop ${jobName} frees disk space in its job`
      ).toBeGreaterThan(-1);
      expect(
        freed,
        `develop ${jobName} frees disk space before its first build`
      ).toBeLessThan(firstGate);
    }
  });

  // Every job is a hosted runner of its own, so each states its own guardrails:
  // the standard ubuntu-latest image (the owner kept every job on it), a
  // timeout so a hang fails within a bounded time instead of GitHub's six-hour
  // default, and a checkout that persists no credential, which would otherwise
  // sit in .git/config through every gate and build, beside the release
  // publishing jobs' packages:write token.
  it("bounds every job with its own timeout, runner and credential-free checkout", () => {
    for (const name of ["pull-request", "develop", "release"]) {
      const workflow = read(`${WORKFLOWS}/${name}.yml`);
      const jobs = jobsOf(workflow);

      expect(jobs.size, name).toBeGreaterThan(0);
      expect(checkoutSteps(workflow).length, name).toBeGreaterThan(0);

      for (const [job, text] of jobs) {
        expect(text, `${name} ${job} declares timeout-minutes`).toMatch(
          /^ {4}timeout-minutes: \d+$/m
        );
        expect(text, `${name} ${job} stays on ubuntu-latest`).toMatch(
          /^ {4}runs-on: ubuntu-latest$/m
        );

        for (const step of checkoutSteps(text)) {
          expect(
            step,
            `${name} ${job} persists no checkout credential`
          ).toMatch(/^\s+persist-credentials: false$/m);
        }
      }
    }
  });

  it("never pushes an image except through the smoke-then-publish wrapper", () => {
    for (const name of ["pull-request", "develop", "release"]) {
      expect(read(`${WORKFLOWS}/${name}.yml`)).not.toContain("docker push");
    }

    // The wrapper itself is the one place that pushes, and it reads the
    // customer's modules.txt, builds, smoke-tests and only then publishes.
    const customer = read("scripts/build-customer-image.sh");

    expect(customer).toContain("cli.ts");
  });

  it("wires the root scripts the workflows call", () => {
    const pr = rootScript("ci:pr");

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build-storybook",
      "test-storybook",
      "test:integration",
    ]) {
      expect(pr, `ci:pr must run ${target}`).toContain(target);
    }

    expect(pr).toContain("validate");

    // Without bail, Nx waits for every sibling after one fails, so a slow or
    // stalled sibling kept ci:develop silent for 14 minutes after a failure
    // (develop run 35867486208).
    const integration = pr
      .split("&&")
      .find((segment) => segment.includes("test:integration"));

    expect(integration).toContain("--nx-bail");

    // The integration projects run one at a time. In parallel on a 4-vCPU
    // runner, the Storybook browser matrix competed with the app's Docker
    // image builds and failed on browser connect timeouts and the Vitest
    // import race (develop runs 35893905134 and 35932712679).
    expect(integration).toContain("--parallel=1");
    // The app's test:integration already depends on test:e2e:fixture, so
    // ci:develop no longer runs the fixture suite a second time (owner Cut 1).
    expect(rootScript("ci:develop")).not.toContain("test:e2e:fixture");
    expect(appTargetDependsOn("test:integration")).toContain(
      "test:e2e:fixture"
    );
    expect(rootScript("ci:release:customer")).toContain(
      "scripts/build-customer-image.sh"
    );
    expect(rootScript("ci:release:development")).toContain(
      "scripts/build-development-image.sh"
    );
  });

  it("runs the ordinary app E2E suite on develop, the fixture suite through test:integration", () => {
    const develop = rootScript("ci:develop");

    // A bare `test:e2e` substring would also match `test:e2e:fixture`.
    expect(develop).toMatch(/@genie\/app:test:e2e(?![\w:-])/);
    expect(develop).not.toContain("@genie/app:test:e2e:fixture");
    expect(develop).toContain("ci:pr");

    expect(appScript("test:e2e")).toContain(
      "--config apps/genie/playwright.config.ts"
    );

    const config = read("apps/genie/playwright.config.ts");

    expect(config).toContain('name: "phone"');
    expect(config).toContain('name: "desktop"');
  });

  // The generated-module proof (R-30/AC-7) is docker- and browser-heavy: it
  // generates a module, builds an image carrying it and proves the denied route
  // at both viewports. Its only caller was a person who remembered the script,
  // so CI always reported the spec's three skips and nothing failed when the
  // script drifted from the generator's output. It runs in the E2E job, which
  // already builds images and launches the browser, and never in the gates.
  it("runs the generated-module proof in the develop E2E job", () => {
    const e2eJob = jobsOf(read(`${WORKFLOWS}/develop.yml`)).get("e2e");

    expect(e2eJob, "an e2e job").toBeDefined();

    const scripts = runScripts(e2eJob ?? "").join("\n");

    expect(scripts, "the e2e job runs the generated-module proof").toMatch(
      targetPattern("test:e2e:generated")
    );

    // The target runs the script that sets GENIE_MODULE_UNDER_TEST; a target
    // that ran something else would report three skips and prove nothing.
    expect(appScript("test:e2e:generated")).toContain(
      "tools/generators/scripts/prove-generated-module.ts"
    );
  });

  // Coverage is a local developer tool, never a gate. It has exactly one entry
  // point, the root `coverage` script, and no CI script or workflow may run it.
  it("keeps coverage local: one root script, and no CI gate runs it", () => {
    const coverage = rootScript("coverage");

    expect(coverage).toContain("nx run-many");
    expect(coverage).toContain("--coverage");

    // SAFETY: the root manifest is this repository's own package.json.
    const manifest = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
    ) as RootScripts;

    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (name === "coverage") continue;

      expect(command, name).not.toContain("coverage");
    }

    for (const file of workflowFiles()) {
      expect(read(file), file).not.toContain("coverage");
    }
  });
});
