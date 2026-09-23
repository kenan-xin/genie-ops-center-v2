import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * A disposable copy of the workspace under the operating system's temporary
 * directory, outside the repository's inventory, for an image build that needs
 * a changed build input. The repository itself is never touched.
 *
 * Each call allocates its own uniquely named stage, so a caller can only ever
 * delete a path it knows it owns.
 */
export const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** Directory names never staged: untracked build output, caches, and bulk docs. */
const PRUNED = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nx",
  ".turbo",
  ".beads",
  ".impeccable",
  ".storybook",
  "storybook-static",
  "test-results",
  "playwright-report",
  "dist",
  "coverage",
  "docs",
  "plans",
]);

export function stageWorkspace(prefix: string): string {
  const stage = mkdtempSync(join(tmpdir(), prefix));

  cpSync(REPO_ROOT, stage, {
    recursive: true,
    filter: (source) => !PRUNED.has(source.split(/[\\/]/).pop() ?? ""),
  });

  return stage;
}

/**
 * Copies one fixture template from `apps/genie/tools/fixture-modules/<id>` into
 * the stage as an ordinary module package under `packages/modules/<id>`.
 */
export function stageFixtureModule(stage: string, id: string): void {
  const source = join(REPO_ROOT, "apps/genie/tools/fixture-modules", id);

  if (!existsSync(join(source, "package.json"))) {
    throw new Error(`missing fixture template: ${source}`);
  }

  cpSync(source, join(stage, "packages/modules", id), { recursive: true });
}
