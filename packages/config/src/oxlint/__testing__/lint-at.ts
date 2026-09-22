import { execFile } from "node:child_process";
import {
  existsSync,
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
 * Removes one directory, and only while it is still empty. `rmdirSync` is the
 * only removal here on purpose: a recursive removal would take unrelated content
 * that appeared after the fixture was created along with the directory.
 */
function removeIfEmpty(directory: string): void {
  try {
    rmdirSync(directory);
  } catch (error) {
    // SAFETY: rmdirSync throws a NodeJS.ErrnoException, whose `code` is the only
    // field read here.
    const { code } = error as { code?: string };

    // ENOTEMPTY: the directory holds something this invocation did not create, so
    // it is no longer ours to remove. ENOENT: a concurrent run removed it first.
    if (code !== "ENOTEMPTY" && code !== "ENOENT") throw error;
  }
}

/** Everything needed to create one fixture and to clean up after it. */
type FixturePlan = {
  readonly relativePath: string;
  readonly absolute: string;
  /**
   * The directories between the fixture and its root that did not exist when the
   * plan was made, deepest first, so cleanup removes exactly what this fixture
   * brought into being and never an ancestor of it.
   */
  readonly createdDirectories: readonly string[];
};

/**
 * Validates one fixture path against its root and records what the fixture would
 * have to create. The validation throws before any fixture is queued, so a bad
 * path stays a synchronous refusal even though the lint itself is awaited.
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

  // Collected before anything is created, deepest first, so cleanup removes exactly
  // the directories this invocation owns and never an ancestor of them.
  const createdDirectories: string[] = [];

  for (
    let cursor = dirname(absolute);
    cursor !== root && !existsSync(cursor);
    cursor = dirname(cursor)
  ) {
    createdDirectories.push(cursor);
  }

  return { relativePath, absolute, createdDirectories };
}

/**
 * Creates one fixture file exclusively, hands control to `body`, then removes
 * that file and every directory this invocation created, deepest first, and only
 * while still empty.
 *
 * A path that already exists is refused: never overwritten, never deleted. The
 * exclusive `wx` create is what makes that atomic, because an `existsSync` check
 * followed by a write can still be raced into clobbering another fixture.
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

    // Leaf first, so each directory is empty when its turn comes.
    for (const dir of plan.createdDirectories) removeIfEmpty(dir);
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
      ["--config", "oxlint.config.ts", "--no-ignore", relativePath],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PATH: childPath() },
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

    // Leaf first, so each directory is empty when its turn comes. A concurrent
    // fixture sharing a planned directory keeps it standing: `removeIfEmpty`
    // leaves a directory it does not find empty exactly where it is.
    for (const dir of plan.createdDirectories) removeIfEmpty(dir);
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

const PATH_CHAINS = new Map<string, Promise<unknown>>();

/**
 * Runs `task` only after every task already queued for `key` has settled.
 * Fixtures that reuse a path with different sources would otherwise race their
 * exclusive writes; one chain per path keeps those runs in order while different
 * paths still overlap. Chains hold settled promises, never rejections, so one
 * failing fixture cannot poison the next run on the same path.
 */
function serializeByPath<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = PATH_CHAINS.get(key) ?? Promise.resolve();
  const run = previous.then(task);
  const recorded = run.catch(() => undefined);

  PATH_CHAINS.set(key, recorded);

  void recorded.then(() => {
    if (PATH_CHAINS.get(key) === recorded) PATH_CHAINS.delete(key);
  });

  return run;
}

/**
 * Lints one source string at a chosen repository-relative path, then deletes the file.
 * The path decides which layer override applies, so a caller picks the path on purpose.
 * Any directory this function created is removed as well, and only while empty, so the
 * working tree stays clean. A path that already exists is refused rather than
 * overwritten, which keeps one test from silently consuming another's fixture.
 *
 * The lint resolves through a per-path chain and a machine-sized slot pool, so a
 * suite of these runs concurrently where the paths differ and in order where a
 * path repeats. A refused path still throws synchronously, before anything is
 * queued.
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

  return serializeByPath(`${WORKSPACE_ROOT}:${relativePath}`, () =>
    withLintSlot(() => lintFixtureAt(WORKSPACE_ROOT, plan, source))
  );
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
