import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { scopedProject } from "./worktree-scope.ts";

const run = promisify(execFile);

/**
 * The compose project of this worktree's identity stand-ins. The stack's one
 * network carries the same name, so it is scoped to the worktree too.
 */
export function standinNetworkName(): string {
  return scopedProject("genie-identity-standins");
}

export type NetworkUse = {
  readonly name: string;
  /** Containers that still use the network, stopped ones included. */
  readonly containerCount: number;
};

/**
 * The networks a sweep may remove: only this worktree's own stand-in network,
 * and only when no container uses it.
 *
 * Docker's `name` filter matches part of a name, so it can also list another
 * worktree's network (`-a` finds `-ab`). This keeps the exact name only. Another
 * gate can run in another worktree at the same time, and its network must stay.
 */
export function networksToSweep(
  networks: readonly NetworkUse[],
  ownName: string
): string[] {
  return networks.flatMap((network) =>
    network.name === ownName && network.containerCount === 0
      ? [network.name]
      : []
  );
}

async function containerCount(network: string): Promise<number> {
  // `ps -a` also counts stopped containers. `network inspect` lists only running
  // ones, and a stopped container still needs its network to start again.
  const { stdout } = await run("docker", [
    "ps",
    "-aq",
    "--filter",
    `network=${network}`,
  ]);

  return stdout.split("\n").filter((line) => line.trim() !== "").length;
}

/**
 * Removes this worktree's stand-in network when nothing uses it, and returns
 * the names it removed.
 *
 * Setup calls it first, so a network a killed run or a skipped teardown left
 * behind is gone before `up`. Teardown calls it after `down`, so the network
 * goes even when `down` did not take it. It never fails the caller: a network
 * that is in use, or that Docker refuses to remove, stays where it is.
 */
export async function sweepStandinNetwork(): Promise<string[]> {
  const ownName = standinNetworkName();

  try {
    const { stdout } = await run("docker", [
      "network",
      "ls",
      "--filter",
      `name=${ownName}`,
      "--format",
      "{{.Name}}",
    ]);

    const names = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((name) => name === ownName);

    const uses = await Promise.all(
      names.map(async (name) => ({
        name,
        containerCount: await containerCount(name),
      }))
    );

    const removed = await Promise.all(
      networksToSweep(uses, ownName).map((name) =>
        run("docker", ["network", "rm", name]).then(
          () => name,
          () => undefined
        )
      )
    );

    return removed.filter((name) => name !== undefined);
  } catch {
    return [];
  }
}
