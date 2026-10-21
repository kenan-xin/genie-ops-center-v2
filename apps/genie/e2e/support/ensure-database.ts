import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The Postgres service every e2e compose stack starts, and the throwaway credential it seeds. */
const DATABASE_SERVICE = "database";

const DATABASE_USER = "genie";

const DATABASE_NAME = "genie";

/** How long a database may take to accept connections before the run gives up loudly. */
const READY_TIMEOUT_MS = 120000;

/**
 * Waits until the stack's Postgres accepts TCP connections.
 *
 * The official image runs a temporary init server that listens only on the Unix
 * socket, so a socket `pg_isready` succeeds while the real server has not
 * started. The app and every extra database reach it over TCP, so probe TCP on
 * loopback, which only the real server binds.
 */
export async function waitForDatabase(
  compose: readonly string[]
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = "no attempt was made";

  /* eslint-disable no-await-in-loop -- each attempt exists only because the previous did not answer. */
  while (Date.now() < deadline) {
    try {
      await run("docker", [
        ...compose,
        "exec",
        "-T",
        DATABASE_SERVICE,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-p",
        "5432",
        "-U",
        DATABASE_USER,
      ]);

      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }

    await sleep(500);
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `the ${DATABASE_SERVICE} service never accepted connections: ${last}`
  );
}

/**
 * Creates one extra database in the compose project that owns the stack which
 * uses it.
 *
 * It first waits for Postgres to accept connections. A rerun's duplicate
 * database is the one error it ignores (SQLSTATE 42P04); every other failure
 * throws with the command output, so a broken create can never be silent.
 */
export async function ensureDatabase(
  compose: readonly string[],
  dbName: string
): Promise<void> {
  await waitForDatabase(compose);

  try {
    await run("docker", [
      ...compose,
      "exec",
      "-T",
      DATABASE_SERVICE,
      "psql",
      "-U",
      DATABASE_USER,
      "-d",
      DATABASE_NAME,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `create database ${dbName}`,
    ]);
  } catch (error) {
    // SAFETY: `execFile` rejects with an Error that carries the captured `stdout` and `stderr`.
    const failure = error as { stdout?: string; stderr?: string };
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;

    // ON_ERROR_STOP makes a rerun's duplicate a failure; that one is expected.
    if (/already exists/.test(output)) return;

    throw new Error(
      `creating database ${dbName} in the ${DATABASE_SERVICE} service failed:\n${output || String(error)}`,
      { cause: error }
    );
  }
}
