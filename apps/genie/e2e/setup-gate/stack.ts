import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { scopedPort, scopedProject } from "../../testing/worktree-scope.ts";

const run = promisify(execFile);

export const HOST_PORT = Number(
  process.env.GENIE_SETUP_GATE_PORT ?? scopedPort(9400)
);

// The project name and host port are scoped to this worktree, so two worktrees
// running the gate at once do not share a container name or a host port.
const COMPOSE = [
  "compose",
  "-p",
  scopedProject("genie-s005-setup-gate"),
  "-f",
  resolve(import.meta.dirname, "../../../../deploy/stack/compose.e2e.yaml"),
];

export function compose(
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {}
) {
  return run("docker", [...COMPOSE, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GENIE_HOST_PORT: String(HOST_PORT),
      ...extraEnv,
    },
  });
}
