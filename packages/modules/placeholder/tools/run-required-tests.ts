import { resolve } from "node:path";

import { runRequiredTests } from "@genie/core/testing/required-tests-runner";

import { REQUIRED_TESTS } from "../testing/required-tests-guard.ts";

/**
 * The placeholder module integration entrypoint. All of the behaviour lives in
 * core's shared runner; this file names only what is the module's: the manifest,
 * the config, the report-directory prefix, and the vitest binary next to this
 * checkout.
 */
process.exit(
  await runRequiredTests({
    manifest: REQUIRED_TESTS,
    config: "vitest.integration.config.ts",
    reportPrefix: "genie-module-placeholder-required-",
    vitestPath: resolve(import.meta.dirname, "../node_modules/.bin/vitest"),
    forwardArgs: process.argv.slice(2),
  })
);
