import { resolve } from "node:path";

import { REQUIRED_TESTS } from "../testing/required-tests-guard.ts";
import { runRequiredTests } from "../testing/required-tests-runner.ts";

/**
 * The core integration entrypoint. All of the behaviour lives in the shared
 * runner beside the guard; this file names only what is core's: the manifest,
 * the config, the report-directory prefix, and the vitest binary next to this
 * checkout. It stays local to core so no core file imports an app (R-39).
 */
process.exit(
  await runRequiredTests({
    manifest: REQUIRED_TESTS,
    config: "vitest.integration.config.ts",
    reportPrefix: "genie-core-required-",
    vitestPath: resolve(import.meta.dirname, "../node_modules/.bin/vitest"),
    forwardArgs: process.argv.slice(2),
  })
);
