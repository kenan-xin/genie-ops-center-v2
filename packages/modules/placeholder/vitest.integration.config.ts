import { defineConfig } from "vitest/config";

/**
 * The module's real-database tests. They live under `testing/`, which the unit preset excludes
 * on purpose, so they need this configuration to be discovered at all. Every test here takes a
 * disposable Postgres with the real migration histories applied; none mocks the database
 * (R-38).
 *
 * `passWithNoTests` stays false, so a file that stops matching fails this target rather than
 * reporting a quiet success. The timeout is the container start, not the assertions.
 */
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["testing/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
