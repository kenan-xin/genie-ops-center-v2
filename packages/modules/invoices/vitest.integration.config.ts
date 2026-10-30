import { NO_LIVE_MODEL_SETUP } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

/**
 * The module's real-database tests. They live under `testing/`, which the unit preset
 * excludes on purpose, so they need this configuration to be discovered at all. Every test
 * here takes a disposable Postgres with the real migration histories applied; none mocks the
 * database (R-38).
 */
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["testing/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    // The same guard every unit run installs: no request reaches a live model host.
    setupFiles: [NO_LIVE_MODEL_SETUP],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
