import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

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
  const absolute = join(root, relativePath);
  const inside = relative(root, absolute);

  if (inside === "" || inside.startsWith("..")) {
    throw new Error(
      `A fixture path must name a file inside its root: ${relativePath}`
    );
  }

  const directory = dirname(absolute);
  // Collected before anything is created, deepest first, so cleanup removes exactly
  // the directories this invocation owns and never an ancestor of them.
  const createdDirectories: string[] = [];

  for (
    let cursor = directory;
    cursor !== root && !existsSync(cursor);
    cursor = dirname(cursor)
  ) {
    createdDirectories.push(cursor);
  }

  let created = false;

  try {
    mkdirSync(directory, { recursive: true });

    writeFileSync(absolute, source, { encoding: "utf8", flag: "wx" });
    created = true;

    return body();
  } finally {
    if (created) rmSync(absolute, { force: true });

    // Leaf first, so each directory is empty when its turn comes.
    for (const dir of createdDirectories) removeIfEmpty(dir);
  }
}

/** Runs the repository's own oxlint configuration from `root` against one path. */
function runOxlint(root: string, relativePath: string): LintOutcome {
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "oxlint", "--config", "oxlint.config.ts", relativePath],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    return { failed: false, output };
  } catch (error) {
    // SAFETY: execFileSync throws an Error that also carries stdout and stderr. Only
    // the output fields are read, so the narrow shape holds for every error this call
    // raises.
    const failure = error as { stdout?: string; stderr?: string };

    return {
      failed: true,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

/**
 * Lints one source string at a chosen repository-relative path, then deletes the file.
 * The path decides which layer override applies, so a caller picks the path on purpose.
 * Any directory this function created is removed as well, and only while empty, so the
 * working tree stays clean. A path that already exists is refused rather than
 * overwritten, which keeps one test from silently consuming another's fixture.
 *
 * For a path the product itself owns, use `lintAtIsolated` instead. This function
 * refuses such a path once the real file lands, which is correct and is why the
 * isolated variant exists.
 */
export function lintAt(relativePath: string, source: string): LintOutcome {
  return withFixture(WORKSPACE_ROOT, relativePath, source, () =>
    runOxlint(WORKSPACE_ROOT, relativePath)
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
 * No path under `packages/` can be served, because `packages` is one of those
 * symlinks. Most boundary rules key there, so if such a path ever needs a
 * fixture, reopen this by making `root/packages` a real directory holding one
 * symlink per child: only the symlinked children then stay off-limits.
 */
export function lintAtIsolated(
  relativePath: string,
  source: string
): LintOutcome {
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

  try {
    for (const anchor of ISOLATED_ROOT_ANCHORS) {
      symlinkSync(join(WORKSPACE_ROOT, anchor), join(root, anchor));
    }

    return withFixture(root, safePath, source, () => runOxlint(root, safePath));
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
}
