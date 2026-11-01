import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The model evaluation's own runner (R-58, S7-14). No Nx target and no root script names this
 * file, so no gate runs it (`gate-guard.test.ts`). A full live run takes hours, so the timeout is
 * a day; the evaluation scores a slow case instead of failing it.
 */
export default defineConfig({
  test: {
    name: "model-evaluation",
    root: fileURLToPath(new URL("../..", import.meta.url)),
    environment: "node",
    include: ["tools/evaluation/run.eval.ts"],
    passWithNoTests: false,
    testTimeout: 86_400_000,
    hookTimeout: 240_000,
  },
});
