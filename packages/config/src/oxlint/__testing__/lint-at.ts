import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  sep,
} from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

/** The checkout's own oxlint, the one `node_modules/.bin` holds. */
const WORKSPACE_BIN = join(WORKSPACE_ROOT, "node_modules", ".bin");

/**
 * The argv every harness invocation of the repository's oxlint shares, so the
 * output format is named in exactly one place.
 *
 * `--format=default` is named because oxlint otherwise picks its format from the
 * environment: the `github` annotations under GitHub Actions and the `agent`
 * format inside a coding agent, both of which replace the message text the
 * suites assert on. Naming `default` makes the output identical on a runner, in
 * a developer's agent session, and on a plain terminal.
 */
export const OXLINT_BASE_ARGS: readonly string[] = [
  "--config",
  "oxlint.config.ts",
  "--format=default",
];

/**
 * The entries an isolated root needs before the repository's own
 * `oxlint.config.ts` loads inside it. Oxlint anchors an override's `files` glob
 * and the plugin specifier to the directory that holds the config file, so the
 * config is symlinked and never copied: the run reads the real file, and a
 * fixture path is matched against the isolated root instead of the checkout.
 */
const ISOLATED_ROOT_ANCHORS: readonly string[] = [
  "oxlint.config.ts",
  "packages",
  "node_modules",
];

/**
 * Names every isolated root this process owns, and no other process's. One
 * constant, so that the code creating a root and the code listing them cannot
 * drift apart: the process id is what keeps two vitest workers from counting
 * each other's roots.
 */
export const ISOLATED_ROOT_PREFIX = `oxlint-boundary-${process.pid}-`;

/**
 * How many oxlint runs this worker may have in flight. The boundary suites mark
 * themselves concurrent, so the harness, not vitest, owns this ceiling: every
 * run is a whole node process, and one per test at once would thrash a small
 * machine. A quarter of the machine, at least two, overlaps most of the suite
 * on any size of host while leaving the machine to the rest of the run.
 */
const MAX_CONCURRENT_LINTS = Math.max(2, Math.ceil(availableParallelism() / 4));

export type LintOutcome = { readonly failed: boolean; readonly output: string };

/**
 * Removes the directory chain a fixture sits under, leaf first, and only while
 * each directory is still empty. `rmdirSync` is the only removal here on
 * purpose: a recursive removal would take unrelated content that appeared after
 * the fixture was created along with the directory, and it would follow a
 * symlink.
 *
 * The walk starts at the fixture's own directory and climbs to `root`. It is not
 * restricted to directories that were absent when the fixture was planned: two
 * concurrent fixtures can share a directory, one removing it while the other
 * recreates it, and a plan made in that window would otherwise leave the
 * directory behind. Removing only empty directories is what keeps this safe.
 */
function removeEmptyAncestors(absolute: string, root: string): void {
  for (
    let cursor = dirname(absolute);
    cursor !== root;
    cursor = dirname(cursor)
  ) {
    try {
      rmdirSync(cursor);
    } catch (error) {
      // SAFETY: rmdirSync throws a NodeJS.ErrnoException, whose `code` is the
      // only field read here.
      const { code } = error as { code?: string };

      // ENOTEMPTY: the directory holds something this invocation did not create,
      // so it and every ancestor are no longer ours to remove. ENOTDIR: an
      // ancestor is a file, which no removal may touch. Either way, stop.
      if (code === "ENOTEMPTY" || code === "ENOTDIR") return;

      // ENOENT: a concurrent run removed it first. Keep climbing, because its
      // parent may now be empty.
      if (code !== "ENOENT") throw error;
    }
  }
}

/** Everything needed to create one fixture and to clean up after it. */
type FixturePlan = {
  readonly relativePath: string;
  readonly absolute: string;
};

/**
 * Validates one fixture path against its root. The validation throws before any
 * fixture is queued, so a bad path stays a synchronous refusal even though the
 * lint itself is awaited.
 */
function planFixture(root: string, relativePath: string): FixturePlan {
  const absolute = join(root, relativePath);
  const inside = relative(root, absolute);

  if (
    inside === "" ||
    inside === ".." ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside)
  ) {
    throw new Error(
      `A fixture path must name a file inside its root: ${relativePath}`
    );
  }

  return { relativePath, absolute };
}

/**
 * Creates one fixture file exclusively, hands control to `body`, then removes
 * that file and the empty directories it sat under, deepest first.
 *
 * A path that already exists is refused: never overwritten, never deleted. The
 * exclusive `wx` create is what makes that atomic, because an `existsSync` check
 * followed by a write can still be raced into clobbering another fixture.
 *
 * Unsupported: two processes running these suites against one checkout at once.
 * The paths are fixed because each must match one exact override glob, so the
 * second process meets the first one's file and fails with `EEXIST`. One process
 * is safe, because `serializeByPath` orders same-path calls, and Nx runs
 * `@genie/config:test` once. Run a second copy from its own worktree
 * (genie-ops-center-v2-20z).
 */
export function withFixture<T>(
  root: string,
  relativePath: string,
  source: string,
  body: () => T
): T {
  const plan = planFixture(root, relativePath);
  let created = false;

  try {
    mkdirSync(dirname(plan.absolute), { recursive: true });

    writeFileSync(plan.absolute, source, { encoding: "utf8", flag: "wx" });
    created = true;

    return body();
  } finally {
    if (created) rmSync(plan.absolute, { force: true });

    removeEmptyAncestors(plan.absolute, root);
  }
}

/**
 * The child `PATH` for a lint run: the caller's first, the checkout's `.bin`
 * behind it. The lookup order is the seam the tests stand a scripted oxlint in
 * with, and the appended entry is what makes a bare `vitest` invocation find
 * this checkout's binary at all, since nothing else puts `.bin` on `PATH`.
 */
function childPath(): string {
  const base = process.env.PATH ?? "";

  return base === "" ? WORKSPACE_BIN : `${base}${delimiter}${WORKSPACE_BIN}`;
}

/**
 * The environment for an oxlint run. `FORCE_COLOR=0` is what keeps the output
 * the same on a plain terminal, in an agent session, and under Nx, which turns
 * color on for its children. Colored output replaces the `x`/`!` level glyph and
 * the `,-[path]` header with ANSI-wrapped ones, so naming it here is the color
 * twin of naming `--format=default` in `OXLINT_BASE_ARGS`.
 */
function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: childPath(), FORCE_COLOR: "0" };
}

/** Runs the repository's own oxlint configuration from `root` against one path. */
async function runOxlint(
  root: string,
  relativePath: string
): Promise<LintOutcome> {
  try {
    const { stdout } = await execFileAsync(
      "oxlint",
      // `--no-ignore` is what lets a fixture the root `.eslintignore` excludes be
      // linted on its explicit path: that file is the product scan's guard against
      // a fixture vanishing mid-walk, not this harness's. The config's own
      // `ignorePatterns` are not ignore-file entries and stay in force.
      [...OXLINT_BASE_ARGS, "--no-ignore", relativePath],
      {
        cwd: root,
        encoding: "utf8",
        env: childEnv(),
      }
    );

    return { failed: false, output: stdout };
  } catch (error) {
    // SAFETY: execFile rejects with an Error that also carries stdout and stderr. Only
    // the output fields are read, so the narrow shape holds for every error this call
    // raises.
    const failure = error as { stdout?: string; stderr?: string };

    return {
      failed: true,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

/** Writes one planned fixture, lints it, and cleans up exactly what it created. */
async function lintFixtureAt(
  root: string,
  plan: FixturePlan,
  source: string
): Promise<LintOutcome> {
  let created = false;

  try {
    mkdirSync(dirname(plan.absolute), { recursive: true });

    writeFileSync(plan.absolute, source, { encoding: "utf8", flag: "wx" });
    created = true;

    return await runOxlint(root, plan.relativePath);
  } finally {
    if (created) rmSync(plan.absolute, { force: true });

    // A concurrent fixture sharing the directory keeps it standing: the walk
    // leaves a directory it does not find empty exactly where it is.
    removeEmptyAncestors(plan.absolute, root);
  }
}

let runningLints = 0;

const lintWaiters: Array<() => void> = [];

/** Runs `task`, but at most `MAX_CONCURRENT_LINTS` of these at any moment. */
async function withLintSlot<T>(task: () => Promise<T>): Promise<T> {
  if (runningLints >= MAX_CONCURRENT_LINTS) {
    await new Promise<void>((resolve) => {
      lintWaiters.push(resolve);
    });
  }

  runningLints += 1;

  try {
    return await task();
  } finally {
    runningLints -= 1;
    lintWaiters.shift()?.();
  }
}

/** One queued checkout fixture awaiting its turn in a batched oxlint run. */
type LintJob = {
  readonly plan: FixturePlan;
  readonly source: string;
  readonly resolve: (outcome: LintOutcome) => void;
  readonly reject: (error: Error) => void;
};

/**
 * The checkout fixtures waiting to be linted. Many cases share one path with a
 * different source, so a batch may include a path at most once; the rest stay
 * queued for the next batch. That keeps two writers off one path while letting
 * every distinct path share a single oxlint process.
 */
const pendingLints: LintJob[] = [];

let flushTimer: ReturnType<typeof setImmediate> | undefined;

let flushing = false;

/**
 * Waits one macrotask, then drains everything queued into batches. The wait is
 * what lets a concurrent suite enqueue all of its fixtures before the first
 * process starts: vitest starts every test in a suite in one tick, and each
 * calls `lintAt` before it awaits.
 */
function scheduleFlush(): void {
  if (flushing || flushTimer !== undefined) return;

  flushTimer = setImmediate(() => {
    flushTimer = undefined;
    void flushPending();
  });
}

/**
 * Runs the queued fixtures one batch at a time. Single-flight, so a fixture is
 * never written while an earlier batch still holds that path on disk. Work that
 * arrives mid-drain is picked up by the same loop, and anything that lands after
 * the last check re-arms the timer in `finally`, so no wakeup is lost.
 */
async function flushPending(): Promise<void> {
  if (flushing) return;

  flushing = true;

  try {
    await drainBatches();
  } finally {
    flushing = false;

    if (pendingLints.length > 0) scheduleFlush();
  }
}

/**
 * Runs each distinct-path batch in turn until nothing is left queued. One
 * awaited call per batch, so a path a later batch needs is never written while
 * an earlier batch still holds it.
 */
async function drainBatches(): Promise<void> {
  const batch = takeUniquePathBatch();

  if (batch.length === 0) return;

  await lintBatch(batch);

  await drainBatches();
}

/**
 * Removes and returns the first queued job for every distinct path, in queue
 * order. A path's later jobs stay behind, preserving the per-path order the old
 * serialization guaranteed without a spawn per case.
 */
function takeUniquePathBatch(): LintJob[] {
  const batch: LintJob[] = [];
  const chosen = new Set<LintJob>();
  const paths = new Set<string>();

  for (const job of pendingLints) {
    if (paths.has(job.plan.relativePath)) continue;

    paths.add(job.plan.relativePath);
    chosen.add(job);
    batch.push(job);
  }

  pendingLints.splice(
    0,
    pendingLints.length,
    ...pendingLints.filter((job) => !chosen.has(job))
  );

  return batch;
}

/** One diagnostic as oxlint's default reporter prints it, with its file header. */
type DiagnosticBlock = { readonly level: string; readonly lines: string[] };

/** The line naming a diagnostic's level, such as `  x eslint(no-unused-vars): …`. */
const DIAGNOSTIC_LEVEL = /^\s*([x!])\s+\S+\([^)]*\):/;

/** The line naming the file a diagnostic landed in: `   ,-[path:line:col]`. */
const DIAGNOSTIC_HEADER = /^\s*,-\[(.+?):\d+:\d+\]/;

/** The line ending a diagnostic's code frame. The `help:` line follows it. */
const DIAGNOSTIC_CLOSE = /^\s*`----\s*$/;

/** The remedy line oxlint prints after a code frame, part of the case's output. */
const DIAGNOSTIC_HELP = /^\s*help:/;

/**
 * Splits one batched report into per-path outcomes, so a case asserts exactly
 * what it would have from a single-file run: its own diagnostics as text, and
 * `failed` only when one of them is an error. The level glyph (`x` error, `!`
 * warning) is read per block, because oxlint's exit code reflects the whole
 * batch and cannot be attributed to a file.
 */
function attributeDiagnostics(output: string): Map<string, LintOutcome> {
  const blocks = new Map<string, DiagnosticBlock[]>();
  let pendingLevelLine: string | undefined;
  let pendingLevel: string | undefined;

  let current:
    | { path: string; level: string; lines: string[]; closed: boolean }
    | undefined;

  const finish = (): void => {
    if (current === undefined) return;

    const list = blocks.get(current.path) ?? [];

    list.push({ level: current.level, lines: current.lines });
    blocks.set(current.path, list);
    current = undefined;
  };

  for (const line of output.split("\n")) {
    const level = DIAGNOSTIC_LEVEL.exec(line);

    if (level !== null) {
      finish();
      pendingLevelLine = line;
      pendingLevel = level[1];
      continue;
    }

    const header = DIAGNOSTIC_HEADER.exec(line);

    if (header !== null) {
      finish();
      current = {
        path: header[1]?.trim() ?? "",
        level: pendingLevel ?? "x",
        lines: [pendingLevelLine ?? "", line],
        closed: false,
      };
      pendingLevelLine = undefined;
      pendingLevel = undefined;
      continue;
    }

    if (current === undefined) continue;

    // The code frame ends at the backtick-dashes, but the `help:` remedy follows
    // it and carries the message every case asserts. Keep copying while the block
    // is open, then its `help:` tail; anything else ends it.
    if (current.closed) {
      if (DIAGNOSTIC_HELP.test(line)) current.lines.push(line);
      else finish();
      continue;
    }

    current.lines.push(line);

    if (DIAGNOSTIC_CLOSE.test(line)) current.closed = true;
  }

  finish();

  const outcomes = new Map<string, LintOutcome>();

  for (const [path, list] of blocks) {
    outcomes.set(path, {
      failed: list.some((block) => block.level === "x"),
      output: list.map((block) => block.lines.join("\n")).join("\n"),
    });
  }

  return outcomes;
}

/**
 * Runs the repository's oxlint over many explicit paths in one process. Returns
 * whether it exited cleanly so the caller can fail closed when the batch itself
 * broke, and not silently mark every fixture as passing.
 */
async function runOxlintBatch(
  relativePaths: readonly string[]
): Promise<{ readonly ok: boolean; readonly output: string }> {
  try {
    const { stdout } = await execFileAsync(
      "oxlint",
      [...OXLINT_BASE_ARGS, "--no-ignore", ...relativePaths],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        env: childEnv(),
        maxBuffer: 32 * 1024 * 1024,
      }
    );

    return { ok: true, output: stdout };
  } catch (error) {
    // SAFETY: execFile rejects with an Error that also carries stdout and stderr. Only
    // the output fields are read, so the narrow shape holds for every error this call
    // raises.
    const failure = error as { stdout?: string; stderr?: string };

    return {
      ok: false,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

/**
 * Writes every fixture in one batch, lints them in a single oxlint process, then
 * removes exactly what it created. A refused write rejects only its own job.
 * When the process produced no report at all, every fixture fails closed so a
 * broken batch is never mistaken for a clean lint.
 */
async function lintBatch(jobs: readonly LintJob[]): Promise<void> {
  const written: LintJob[] = [];

  for (const job of jobs) {
    try {
      mkdirSync(dirname(job.plan.absolute), { recursive: true });

      writeFileSync(job.plan.absolute, job.source, {
        encoding: "utf8",
        flag: "wx",
      });
      written.push(job);
    } catch (error) {
      job.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  try {
    if (written.length > 0) {
      const report = await runOxlintBatch(
        written.map((job) => job.plan.relativePath)
      );

      const outcomes = attributeDiagnostics(report.output);
      const broke = !report.ok && outcomes.size === 0;

      for (const job of written) {
        const outcome = outcomes.get(job.plan.relativePath);

        if (outcome !== undefined) job.resolve(outcome);
        else if (broke) job.resolve({ failed: true, output: report.output });
        else job.resolve({ failed: false, output: "" });
      }
    }
  } finally {
    for (const job of written) {
      rmSync(job.plan.absolute, { force: true });

      // A concurrent fixture sharing the directory keeps it standing: the walk
      // leaves a directory it does not find empty exactly where it is.
      removeEmptyAncestors(job.plan.absolute, WORKSPACE_ROOT);
    }
  }
}

/**
 * Lints one source string at a chosen repository-relative path, then deletes the file.
 * The path decides which layer override applies, so a caller picks the path on purpose.
 * Any directory this function created is removed as well, and only while empty, so the
 * working tree stays clean. A path that already exists is refused rather than
 * overwritten, which keeps one test from silently consuming another's fixture.
 *
 * Every call queued in the same tick is linted together, one process per batch of
 * distinct paths, instead of one process per case. A path repeated with different
 * sources is linted in a later batch, in call order, so the exclusive writes never
 * race. A refused path still throws synchronously, before anything is queued.
 *
 * For a path the product itself owns, use `lintAtIsolated` instead. This function
 * refuses such a path once the real file lands, which is correct and is why the
 * isolated variant exists.
 */
export function lintAt(
  relativePath: string,
  source: string
): Promise<LintOutcome> {
  const plan = planFixture(WORKSPACE_ROOT, relativePath);

  return new Promise<LintOutcome>((resolve, reject) => {
    pendingLints.push({ plan, source, resolve, reject });

    scheduleFlush();
  });
}

/**
 * Lints one source string at a chosen path inside a throwaway root that stands in
 * for the repository. Use this, and not `lintAt`, when the path under test is one
 * the product also owns, such as the Storybook host's `main.ts`. The checkout is
 * never written to, so a real file at that path neither blocks the test nor is
 * touched by it.
 *
 * The root holds the fixture and three symlinks into the checkout. Oxlint loads
 * the repository's real `oxlint.config.ts` through one of them, so the rule values
 * under test are the production ones and cannot drift from them.
 *
 * Every call owns a fresh root, so no two isolated fixtures can collide on a
 * path; only the slot pool bounds their load. A bad path throws synchronously,
 * before anything is queued.
 *
 * No path under `packages/` can be served, because `packages` is one of those
 * symlinks. Most boundary rules key there, so if such a path ever needs a
 * fixture, reopen this by making `root/packages` a real directory holding one
 * symlink per child: only the symlinked children then stay off-limits.
 */
export function lintAtIsolated(
  relativePath: string,
  source: string
): Promise<LintOutcome> {
  if (isAbsolute(relativePath)) {
    throw new Error(
      `An isolated fixture path must be relative: ${relativePath}`
    );
  }

  // Normalized first, so that `./packages/x`, `.//packages/x` and `a/../packages/x`
  // are judged by where they land rather than by how they are spelled.
  const safePath = normalize(relativePath);
  // The default only satisfies `noUncheckedIndexedAccess`. `split` always yields
  // at least one element, and an empty segment is not an anchor name either way.
  const [firstSegment = ""] = safePath.split("/");

  // Each anchor is a symlink into the checkout, so a fixture below one would be
  // written into the real tree. The fixture must land in the root's own storage.
  if (ISOLATED_ROOT_ANCHORS.includes(firstSegment)) {
    throw new Error(
      `An isolated fixture path must not start with a symlinked anchor: ${relativePath}`
    );
  }

  const root = mkdtempSync(join(tmpdir(), ISOLATED_ROOT_PREFIX));

  return withLintSlot(async () => {
    try {
      for (const anchor of ISOLATED_ROOT_ANCHORS) {
        symlinkSync(join(WORKSPACE_ROOT, anchor), join(root, anchor));
      }

      return await lintFixtureAt(root, planFixture(root, safePath), source);
    } finally {
      // Node unlinks a symlink-to-directory rather than descending into it, so the
      // recursive removal below is already safe. Every anchor is unlinked by name
      // first anyway: the cost is three lines, and the cost of that behaviour ever
      // changing is the checkout. `recursive` covers the case where an anchor name
      // is a real directory, which would otherwise throw here and hide a live error.
      for (const anchor of ISOLATED_ROOT_ANCHORS) {
        rmSync(join(root, anchor), { force: true, recursive: true });
      }

      rmSync(root, { recursive: true, force: true });
    }
  });
}
