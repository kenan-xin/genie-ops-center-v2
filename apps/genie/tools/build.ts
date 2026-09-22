import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The application build, as one command that owns its output tree.
 *
 * Checking the generated registry is not enough on its own. Two builds in one
 * checkout share `apps/genie/.next`, so a build can find its own registry intact
 * at both boundaries while another build writes into the same output tree
 * throughout. Nx then stores that mixed tree under a legitimate selection hash
 * and restores it later, which is cross-customer leakage in the artifact rather
 * than in the registry.
 *
 * No check on the registry can see that, so this refuses the situation instead.
 * The first build in a checkout takes an exclusive marker and a second one fails
 * at once rather than waiting: waiting would only queue a second writer behind
 * the first, and the supported way to build two selections at the same time is
 * two build roots (`--root`).
 *
 * The marker lives in the operating system's temporary directory, keyed by the
 * application root, so it is never a repository file and never reaches the
 * cached outputs. A crashed build leaves one behind, and the error names the
 * path to remove, which is the whole recovery.
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

export function lockPathFor(appRoot: string): string {
  const key = createHash("sha256").update(appRoot, "utf8").digest("hex");

  return join(tmpdir(), `genie-app-build-${key.slice(0, 16)}.lock`);
}

/**
 * Takes the exclusive build marker for one application root.
 *
 * `wx` is the whole mechanism: the create either wins or fails, with no window
 * between asking and taking.
 */
export function acquireBuildLock(appRoot: string): string {
  const path = lockPathFor(appRoot);

  try {
    const handle = openSync(path, "wx");

    writeSync(
      handle,
      `pid ${process.pid} selection ${process.env.MODULE_INCLUDE ?? "unset"} at ${new Date().toISOString()}\n`
    );

    return path;
  } catch {
    let owner = "an earlier build";

    try {
      owner = readFileSync(path, "utf8").trim();
    } catch {
      // The marker vanished between the failed create and this read, which
      // means another build released it. Refusing is still correct: that build
      // overlapped this one and wrote into the same output tree.
    }

    throw new Error(
      `Another build already owns ${appRoot} (${owner}). Two builds in one checkout share .next, so the cached bundle would mix both selections. ` +
        `Build each selection in its own root, or remove ${path} if no build is running.`
    );
  }
}

export function releaseBuildLock(path: string): void {
  rmSync(path, { force: true });
}

function main(): void {
  const lock = acquireBuildLock(APP_ROOT);

  try {
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
  } finally {
    releaseBuildLock(lock);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
