import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The disposable stack the fixture browser run drives, and the defaults that
 * make the fixture gate work with no operator-supplied environment: the image
 * `build-fixture-image` produces, on its own host port, under its own compose
 * project name so the ordinary `genie-s005-e2e` stack is never contended.
 */
export const PROJECT = "genie-s005-fixture";

export const IMAGE = process.env.GENIE_IMAGE ?? "genie-s005:fixture";

export const HOST_PORT = Number(process.env.GENIE_HOST_PORT ?? "3406");

/** Walk up from this file until the repository root's compose file appears. */
function composeFile(): string {
  let directory = resolve(import.meta.dirname);

  for (;;) {
    const candidate = join(directory, "deploy/stack/compose.e2e.yaml");

    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);

    if (parent === directory) {
      throw new Error("No deploy/stack/compose.e2e.yaml above this file.");
    }

    directory = parent;
  }
}

type ComposeResult = Promise<{ stdout: string; stderr: string }>;

export const compose = (args: readonly string[]): ComposeResult =>
  run("docker", ["compose", "-p", PROJECT, "-f", composeFile(), ...args], {
    encoding: "utf8",
  });

export const composeWithEnv = (
  args: readonly string[],
  env: Readonly<Record<string, string>>
): ComposeResult =>
  run("docker", ["compose", "-p", PROJECT, "-f", composeFile(), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GENIE_IMAGE: IMAGE,
      GENIE_HOST_PORT: String(HOST_PORT),
      ...env,
    },
  });

/** The app service's whole log so far, stdout and stderr combined. */
export async function appLogs(): Promise<string> {
  try {
    const result = await compose(["logs", "app"]);

    return result.stdout + result.stderr;
  } catch {
    return "";
  }
}

/**
 * Reads the app log until `ready` holds, or the budget expires.
 *
 * The phone and desktop projects run in parallel against one stack, so a
 * line's presence proves the route and its provider ran; which navigation
 * produced it cannot be told apart, and need not be.
 */
export async function logsUntil(
  ready: (logs: string) => boolean,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  /* eslint-disable no-await-in-loop */
  let logs = await appLogs();

  while (!ready(logs) && Date.now() < deadline) {
    await new Promise((settle) => setTimeout(settle, 500));

    logs = await appLogs();
  }
  /* eslint-enable no-await-in-loop */

  return logs;
}
