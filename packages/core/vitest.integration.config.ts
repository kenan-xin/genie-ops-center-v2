import { defineConfig } from "vitest/config";

/**
 * Core's real-database tests. They live under `testing/`, which the unit preset excludes on
 * purpose, so they need this configuration to be discovered at all. Every test here takes a
 * disposable Postgres; none mocks the database (R-38).
 *
 * `passWithNoTests` stays false, so a file that stops matching fails this target rather than
 * reporting a quiet success. The include covers every `testing/*.test.ts`, which adds the
 * runner's own controls beside the real-database files, matching the app harness.
 *
 * Each caller starts its own container, because `pg_locks` is cluster-wide and the migrator's
 * lock assertions must see only their own run's locks (see `testing/postgres.ts`). `maxWorkers`
 * bounds how many of those starts overlap: a start waits a fixed 10 s for the daemon to publish
 * the host port, that wait is not configurable, and an unbounded pile-up of starts is what lets
 * it lose the race when several worktrees run suites at once.
 *
 * The timeout is the container start, not the assertions.
 */
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["testing/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    maxWorkers: 4,
  },
});
