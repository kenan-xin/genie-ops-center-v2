import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

export type LintOutcome = { readonly failed: boolean; readonly output: string };

/**
 * Lints one source string at a chosen repository-relative path, then deletes the file.
 * The path decides which layer override applies, so a caller picks the path on purpose.
 * Any directory this function created is removed as well, so the working tree stays clean.
 */
export function lintAt(relativePath: string, source: string): LintOutcome {
  const absolute = join(WORKSPACE_ROOT, relativePath);
  const directory = dirname(absolute);
  const created: string[] = [];
  let cursor = directory;
  while (cursor !== WORKSPACE_ROOT && !existsSync(cursor)) {
    created.push(cursor);
    cursor = dirname(cursor);
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(absolute, source, "utf8");
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "oxlint", "--config", "oxlint.config.ts", relativePath],
      { cwd: WORKSPACE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { failed: false, output };
  } catch (error) {
    const shaped = error as { stdout?: string; stderr?: string };
    return { failed: true, output: `${shaped.stdout ?? ""}${shaped.stderr ?? ""}` };
  } finally {
    rmSync(absolute, { force: true });
    // Leaf first, so each removed directory is empty when its turn comes.
    // recursive is required: without it rm throws EISDIR on an empty directory.
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
  }
}
