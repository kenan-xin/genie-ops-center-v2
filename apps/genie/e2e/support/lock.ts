import { mkdir, mkdtemp, readdir, rename, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { scopedProject } from "../../testing/worktree-scope.ts";

/** The lock directory of one name, scoped to this worktree. */
export function lockDirectory(name: string): string {
  return join(tmpdir(), scopedProject(`genie-${name}.lock`));
}

/**
 * Holds a named lock across Playwright's worker processes, scoped to this worktree. A proof that
 * changes one deployment-wide row, such as a module entitlement or the branding row, takes it so
 * that the phone and the desktop runs never change that row at once. `waitMs` must cover the
 * longest time the other project holds the lock.
 *
 * The lock folder holds one entry named after the holder's pid, and a take is one rename of a
 * staged folder onto it, which succeeds only while the lock folder is absent or empty. Playwright
 * tears a worker down at a test timeout, so its `finally` never runs: a waiter removes the entry
 * of a holder whose process is gone and takes the lock at once. It removes that entry only, so it
 * can never delete a lock that another waiter took in the meantime.
 */
export async function withDeploymentLock<T>(
  name: string,
  run: () => Promise<T>,
  waitMs = 120_000
): Promise<T> {
  const lock = lockDirectory(name);
  const holder = join(lock, String(process.pid));
  const deadline = Date.now() + waitMs;
  const staging = await mkdtemp(`${lock}.staging-`);
  await mkdir(join(staging, String(process.pid)));

  /* eslint-disable no-await-in-loop -- each attempt exists only because the lock was held. */
  while (true) {
    try {
      await rename(staging, lock);
      break;
    } catch (error) {
      if (await breakDeadHolders(lock)) continue;

      if (Date.now() > deadline) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }

      await sleep(250);
    }
  }
  /* eslint-enable no-await-in-loop */

  try {
    return await run();
  } finally {
    // A release error must not hide the error of the run itself.
    await rm(holder, { recursive: true, force: true });
    await rmdir(lock).catch(() => undefined);
  }
}

/** Removes the entry of each holder whose process is gone, and says whether it removed one. */
async function breakDeadHolders(lock: string): Promise<boolean> {
  const holders = await readdir(lock).catch((): string[] => []);
  const dead = holders.filter((entry) => !isAlive(entry));
  await Promise.all(
    dead.map((entry) => rm(join(lock, entry), { recursive: true, force: true }))
  );

  return dead.length > 0;
}

// shortcut: a pid alone can name a new process after reuse, rare with pid_max 4194304; add the process start time if a reused pid ever holds a lock.
function isAlive(entry: string): boolean {
  const pid = Number(entry);

  // An entry that is not a positive pid is never broken: 0 and negative values signal process groups.
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // EPERM means that the process exists but belongs to another user.
    return !(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}
