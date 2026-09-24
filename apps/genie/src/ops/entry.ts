import { moduleHistory, runGenieOps } from "@genie/core";

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
