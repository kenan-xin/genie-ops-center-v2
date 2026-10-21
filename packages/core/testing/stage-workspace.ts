import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The repository root, which holds the Dockerfile, the lockfile and the
 * workspace a caller stages.
 */
export const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * Directory names never staged: version control, build output, caches, and bulk
 * documents. None is an input to a staged build, and the agent caches (`graft/`,
 * `.claude/`, `.agents/`, `.dolt/` and their siblings) are large enough that
 * copying them into every build context is pure waste.
 *
 * This is the Storybook suite's list, which already excluded the agent caches;
 * it is the correct one, so the app's image stages use it too.
 */
export const PRUNED = new Set([
  ".git",
  ".next",
  ".nx",
  ".beads",
  ".dolt",
  ".impeccable",
  ".turbo",
  ".agents",
  ".claude",
  ".codex",
  ".config",
  "graft",
  "storybook-static",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
  "docs",
  "plans",
]);

export type StageWorkspaceOptions = {
  /**
   * Keep nested `node_modules` (for example `apps/genie/node_modules`), whose
   * entries are relative symlinks that then resolve inside the stage. The root
   * `node_modules` is never staged either way: a caller links or installs its
   * own. Defaults to false, because an image build installs inside the
   * container and needs no staged modules at all.
   */
  readonly keepNestedNodeModules?: boolean;
};

/**
 * A disposable copy of the workspace under the operating system's temporary
 * directory, outside the repository's inventory, for a build that needs a
 * changed input. The repository itself is never touched.
 *
 * Each call allocates its own uniquely named stage, so a caller can only ever
 * delete a path it knows it owns.
 */
export function stageWorkspace(
  prefix: string,
  options: StageWorkspaceOptions = {}
): string {
  const stage = mkdtempSync(join(tmpdir(), prefix));

  const rootModules = join(WORKSPACE_ROOT, "node_modules");

  cpSync(WORKSPACE_ROOT, stage, {
    recursive: true,
    filter: (source) => {
      // The root `node_modules` is replaced by a symlink or a real install; a
      // nested one is copied only when the caller keeps it.
      if (source === rootModules) return false;

      const name = source.split(/[\\/]/).pop() ?? "";

      if (PRUNED.has(name)) return false;

      if (!options.keepNestedNodeModules && name === "node_modules") {
        return false;
      }

      return true;
    },
  });

  return stage;
}
