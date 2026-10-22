import { mkdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { scopedProject } from "../../testing/worktree-scope.ts";

/**
 * Holds a named lock across Playwright's worker processes, scoped to this worktree. A proof that
 * changes one deployment-wide row, such as a module entitlement or the branding row, takes it so
 * that the phone and the desktop runs never change that row at once. `waitMs` must cover the
 * longest time the other project holds the lock.
 */
export async function withDeploymentLock<T>(
  name: string,
  run: () => Promise<T>,
  waitMs = 120_000
): Promise<T> {
  const lock = join(tmpdir(), scopedProject(`genie-${name}.lock`));
  const deadline = Date.now() + waitMs;

  /* eslint-disable no-await-in-loop -- each attempt exists only because the lock was held. */
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw error;

      await sleep(250);
    }
  }
  /* eslint-enable no-await-in-loop */

  try {
    return await run();
  } finally {
    await rmdir(lock);
  }
}
