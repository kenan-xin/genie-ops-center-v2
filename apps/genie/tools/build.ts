import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The application build, as one command.
 *
 * The registry is checked on both sides of the bundler. Generation runs before
 * the build through the Nx graph, and the bundler reads the generated registry
 * minutes later, so the second check is what turns a registry that changed
 * underneath the bundler into a failed build rather than a bundle built from
 * another customer's selection.
 *
 * What this deliberately does NOT do is claim the output tree.
 *
 * Two builds of this project in one checkout share `apps/genie/.next`, so they
 * can mix one output tree and Nx can then cache the result. Three mechanisms
 * were tried and each one failed in a way that was worse than the hole: a lock
 * file outlives a build killed by a signal and blocks every later build; a
 * socket file needs a recovery step, and two builds can each judge one
 * abandoned path dead, with the second removal deleting the first's live
 * socket, leaving two owners; a port derived from the root path collides with
 * an unrelated program and denies a build that was perfectly valid. Node has no
 * advisory file lock, so the textbook mechanism is not available without a new
 * dependency.
 *
 * Two builds of one project in one workspace are already unsupported for every
 * other target here: `test`, `typecheck` and `build-storybook` all write shared
 * outputs, and nothing claims those either. The supported way to build two
 * selections at the same time is two build roots, which `generate-registry
 * --root` exists for, and that path must never be denied by a claim that
 * guesses wrong.
 *
 * The residual hole is recorded in the ticket evidence rather than papered over.
 */
const APP_ROOT = resolve(import.meta.dirname, "..");

export const BUILD_STEPS: readonly (readonly [string, readonly string[]])[] = [
  // Before: the registry on disk must be the one this selection generates.
  ["node", ["tools/check-registry.ts"]],
  ["next", ["build"]],
  // After: nothing rewrote it while the bundler was reading it.
  ["node", ["tools/check-registry.ts"]],
  ["node", ["tools/prune-public-migration-sql.mjs"]],
];

function main(): void {
  for (const [command, args] of BUILD_STEPS) {
    const result = spawnSync(command, [...args], {
      cwd: APP_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;

      return;
    }
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
