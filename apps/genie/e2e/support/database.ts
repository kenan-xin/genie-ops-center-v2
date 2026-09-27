import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { COMPOSE } from "../global-setup.ts";

const run = promisify(execFile);

/**
 * One query against the e2e stack's database, answered as unaligned text with one row per line.
 * A browser proof reads what the app stored this way, because nothing in the app returns it.
 */
export async function queryDatabase(sql: string): Promise<readonly string[]> {
  const { stdout } = await run("docker", [
    ...COMPOSE,
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
