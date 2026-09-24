import { moduleHistory, runGenieOps, runWorker } from "@genie/core";

import { modules } from "../registry.ts";

/**
 * The thin `genie-ops` entry (D-10). It hands the command line, the process environment, the
 * compiled registry and the two output sinks to the core runner, which owns the parsing, the
 * tenant context, the command and the audit row (R-63). Nothing here builds a connection or
 * reads a table.
 *
 * The module histories are the modules only; the runner prepends core's history (R-25). The
 * migrations carry their SQL through the bundler's asset tracing, the same way the application
 * bootstrap does.
 */
export function runGenieOpsEntry(argv: readonly string[]): Promise<number> {
  return runGenieOps(argv, {
    source: process.env,
    compiledModules: modules,
    histories: modules.map(moduleHistory),
    output: (line) => process.stdout.write(`${line}\n`),
    errorOutput: (line) => process.stderr.write(`${line}\n`),
  });
}

/**
 * The worker entry (D-10), bundled through the same instrumentation module as `genie-ops`, so it
 * reads the same traced migration SQL. It passes the compiled registry itself; the runner derives
 * the ids from it (D-12). SIGTERM and SIGINT abort the job loops, and the runner then stops
 * pg-boss and closes the pool.
 */
export function runWorkerEntry(): Promise<number> {
  const controller = new AbortController();

  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());

  return runWorker({
    source: process.env,
    modules,
    histories: modules.map(moduleHistory),
    output: (line) => process.stdout.write(`${line}\n`),
    errorOutput: (line) => process.stderr.write(`${line}\n`),
    signal: controller.signal,
  });
}
