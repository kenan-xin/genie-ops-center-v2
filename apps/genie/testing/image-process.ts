import { execFile } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The image every integration test drives. */
export const IMAGE = "genie-s005:test";

/** Alias mapped to the host gateway, so a container can reach the host database. */
export const HOST_ALIAS = "host.docker.internal";

/**
 * Rewrites a host-side database URL into one the container can reach.
 *
 * The disposable database is published on this host, so inside a container
 * `localhost` is the container itself and the connection is refused. The alias
 * is mapped to the host gateway on the command line, which works on a plain
 * Linux daemon and on Docker Desktop alike.
 */
export function reachableFromContainer(url: string): string {
  const parsed = new URL(url);

  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    parsed.hostname = HOST_ALIAS;
  }

  return parsed.toString();
}

/**
 * Starts the image and returns its container id and a log reader.
 *
 * `--rm` is deliberately absent. A container started with `--rm` is removed the
 * instant it exits, so `docker logs` on a failed bootstrap returns nothing and
 * every log assertion passes vacuously. The container is removed explicitly in
 * `stop()` after the logs have been read.
 *
 * The port is published rather than shared with `--network=host`. Host
 * networking only shares this host's namespace on a plain Linux daemon. Under
 * Docker Desktop it joins the daemon's own virtual machine instead, so the
 * container starts and migrates correctly while every assertion that fetches it
 * fails to connect. That failure reads exactly like a broken application, which
 * cost this ticket a full debugging cycle.
 */
export async function startImage(
  env: Record<string, string>,
  port: number,
  tag: string = IMAGE
) {
  const args = [
    "run",
    "-d",
    "-p",
    `${port}:3000`,
    "--add-host",
    `${HOST_ALIAS}:host-gateway`,
  ];

  for (const [key, value] of Object.entries(env)) {
    const reachable =
      key === "DATABASE_URL" ? reachableFromContainer(value) : value;

    args.push("-e", `${key}=${reachable}`);
  }

  args.push(tag);

  const { stdout } = await run("docker", args);
  const id = stdout.trim();

  return {
    id,
    logs: async () => {
      const result = await run("docker", ["logs", id]).catch(() => ({
        stdout: "",
        stderr: "",
      }));

      return result.stdout + result.stderr;
    },
    stop: () => run("docker", ["rm", "-f", id]).catch(() => undefined),
  };
}

export type RunningImage = Awaited<ReturnType<typeof startImage>>;

/**
 * Reads the container log until it satisfies `ready`, or the budget expires.
 *
 * A single read races the logger's own flush. The server answers the request
 * before pino has written the line, so a test that fetches and then reads once
 * sees a log that is correct but not yet complete, and fails intermittently on
 * an application that is behaving.
 *
 * The final read is returned either way, so a genuine absence still fails the
 * assertion that follows, with the whole log to look at.
 */
export async function logsUntil(
  image: { logs: () => Promise<string> },
  ready: (logs: string) => boolean,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  // Polling is sequential by definition: each read exists only because the
  // previous one was incomplete. Running the reads in parallel would ask the
  // same question of the same moment several times over.
  /* eslint-disable no-await-in-loop */
  let logs = await image.logs();

  while (!ready(logs) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    logs = await image.logs();
  }
  /* eslint-enable no-await-in-loop */

  return logs;
}

/**
 * Reads the container log until `marker` appears, and returns the whole log.
 *
 * This is a log barrier, and it is deliberately strict: a budget expiry THROWS
 * instead of returning the final non-matching read. A barrier that quietly
 * times out would hand the caller a log that simply lacks the line, and every
 * measurement taken "past" it would be a fiction — a zero counted in a window
 * that was never established. The marker must be a string unique to the
 * request being waited for, such as its request id inside its own request
 * line.
 *
 * Ordering guarantee: the application logs through one pino destination in one
 * process, so the byte order of the container log is the order of logging
 * calls. Any line logged before the request that produced `marker` — a viewer
 * request's provider line among them — precedes the marker in the byte stream.
 * That is what makes the marker usable as a flush barrier for everything that
 * happened before it, which a target request's own marker cannot do: the proxy
 * writes a request's line before that request's provider runs.
 */
export async function logsUntilOrThrow(
  image: { logs: () => Promise<string> },
  marker: string,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  // Polling is sequential by definition: each read exists only because the
  // previous one did not contain the marker yet.
  /* eslint-disable no-await-in-loop */
  let logs = await image.logs();

  while (!logs.includes(marker) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    logs = await image.logs();
  }
  /* eslint-enable no-await-in-loop */

  if (!logs.includes(marker)) {
    throw new Error(
      `The log barrier was never observed within ${budgetMs}ms (marker ${marker}). Nothing past this point is proven, so the proof fails here rather than measuring a window that does not exist.`
    );
  }

  return logs;
}

/**
 * Counts the needle lines logged strictly after the `checkpoint` log was read
 * and before the line carrying `marker`, which is the exact window the
 * checkpoint and the barrier establish.
 *
 * The container log is append-only, so `checkpoint` must be a byte prefix of
 * `logs`; a checkpoint that is not a prefix means the log moved underneath the
 * measurement and this throws rather than attributing lines to the wrong
 * request.
 */
export function countInWindow(
  logs: string,
  checkpoint: string,
  marker: string,
  needle: string
): number {
  if (!logs.startsWith(checkpoint)) {
    throw new Error(
      "The container log is not append-only relative to the checkpoint; the measurement window is undefined."
    );
  }

  const markerAt = logs.indexOf(marker);

  if (markerAt === -1) {
    throw new Error(
      "The barrier marker is absent from the log; the measurement window is undefined."
    );
  }

  return countLines(logs.slice(checkpoint.length, markerAt), needle);
}

export async function pollHealth(port: number, attempts = 60) {
  const seen: { elapsed: number; status: number | null }[] = [];
  const startedAt = Date.now();

  // Polling is sequential by definition: each attempt exists only because the
  // previous one did not answer 200, and the elapsed time it records is the
  // measurement. Running the attempts in parallel would fire every request at
  // once and destroy the timeline this test reads.
  /* eslint-disable no-await-in-loop */
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetch(`http://127.0.0.1:${port}/api/health`)
      .then((response) => response.status)
      .catch(() => null);

    seen.push({ elapsed: Date.now() - startedAt, status });

    if (status === 200) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  /* eslint-enable no-await-in-loop */

  return seen;
}

export const countLines = (logs: string, needle: string) =>
  logs.split("\n").filter((line) => line.includes(needle)).length;

/** The repository root, which holds the Dockerfile and the context it builds from. */
export const WORKSPACE_ROOT = resolvePath(import.meta.dirname, "../../..");
