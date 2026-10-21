import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { COMPOSE, LOCAL_COMPOSE } from "../global-setup.ts";

const run = promisify(execFile);

async function query(
  compose: readonly string[],
  sql: string
): Promise<readonly string[]> {
  const { stdout } = await run("docker", [
    ...compose,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-v",
    "ON_ERROR_STOP=1",
    "-t",
    "-A",
    "-c",
    sql,
  ]);

  return stdout.split("\n").filter((line) => line !== "");
}

/**
 * One query against the e2e stack's database, answered as unaligned text with one row per line.
 * A browser proof reads what the app stored this way, because nothing in the app returns it.
 */
export function queryDatabase(sql: string): Promise<readonly string[]> {
  return query(COMPOSE, sql);
}

/** One query against the S-F local-accounts stack's database, its own compose project. */
export function queryLocalDatabase(sql: string): Promise<readonly string[]> {
  return query(LOCAL_COMPOSE, sql);
}
