import { defineConfig } from "vitest/config";

import { unitTestPreset } from "./src/vitest/unit.ts";

export default defineConfig({
  ...unitTestPreset,
  test: {
    ...unitTestPreset.test,
    // The boundary suites queue every case before the first fixture lands, so one
    // file's fixtures batch into a handful of oxlint processes instead of one
    // spawn per case. Vitest's default of 5 caps that queue and so caps the batch
    // size; the harness still serializes the runs themselves, so raising this adds
    // no process-level concurrency (genie-ops-center-v2-qza.5).
    maxConcurrency: 200,
  },
});
