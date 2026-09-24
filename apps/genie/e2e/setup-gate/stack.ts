import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const HOST_PORT = Number(process.env.GENIE_SETUP_GATE_PORT ?? "3407");

const COMPOSE = [
  "compose",
  "-p",
  "genie-s005-setup-gate",
  "-f",
  resolve(import.meta.dirname, "../../../../deploy/stack/compose.e2e.yaml"),
];

export function compose(args: readonly string[]) {
  return run("docker", [...COMPOSE, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GENIE_HOST_PORT: String(HOST_PORT),
    },
  });
}
