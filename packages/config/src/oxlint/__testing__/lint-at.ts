import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

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

/**
 * Lints one source string at a chosen repository-relative path, then deletes the file.
 * The path decides which layer override applies, so a caller picks the path on purpose.
 * Any directory this function created is removed as well, and only while empty, so the
 * working tree stays clean. A path that already exists is refused rather than
 * overwritten, which keeps one test from silently consuming another's fixture.
 */
export function lintAt(relativePath: string, source: string): LintOutcome {
  return withFixture(WORKSPACE_ROOT, relativePath, source, () => {
    try {
      const output = execFileSync(
        "pnpm",
        ["exec", "oxlint", "--config", "oxlint.config.ts", relativePath],
        {
          cwd: WORKSPACE_ROOT,
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
  });
}
