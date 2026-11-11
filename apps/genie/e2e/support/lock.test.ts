import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { lockDirectory, withDeploymentLock } from "./lock.ts";

const name = `lock-test-${process.pid}`;

const lock = lockDirectory(name);

/** Leaves the lock folder the way a holder with that pid leaves it. */
async function heldBy(pid: number): Promise<void> {
  await mkdir(join(lock, String(pid)), { recursive: true });
}

describe("withDeploymentLock", () => {
  afterEach(async () => {
    await rm(lock, { recursive: true, force: true });
  });

  it("breaks at once a lock whose holder process is gone, such as a worker torn down at a test timeout", async () => {
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    await heldBy(deadPid);

    await expect(
      withDeploymentLock(name, async () => "ran", 1_000)
    ).resolves.toBe("ran");
    expect(existsSync(lock) ? await readdir(lock) : []).toEqual([]);
  });

  it("still waits for a holder that is alive", async () => {
    await heldBy(process.ppid);
    const run = vi.fn(async () => "ran");

    await expect(withDeploymentLock(name, run, 300)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await readdir(lock)).toEqual([String(process.ppid)]);
  });
});
