import { defineConfig } from "vitest/config";

/**
 * The app's real-service tests. They live under `testing/`, which the unit preset excludes on
 * purpose, so without this configuration they are collected by nothing and a green unit run
 * would say nothing about the image at all.
 *
 * These tests drive the actual built image, so `pnpm run build-image` (which `test:integration`
 * depends on) must have run first. It builds the per-worktree tag `testing/image-tag.ts` names,
 * so two worktrees never share an image tag. They take a disposable Postgres and never mock the
 * database (R-38).
 *
 * `passWithNoTests` stays false, so a file that stops matching fails this target rather than
 * reporting a quiet success. The timeouts are the image start and the container lifecycle, not
 * the assertions.
 *
 * Each caller starts its own Postgres container (see `@genie/core/testing`'s `postgres.ts` for
 * why one per run was rejected), and `fileParallelism` stays off below, so at most one starts
 * at a time.
 */
export default defineConfig({
  test: {
    name: "app-integration",
    environment: "node",
    include: ["testing/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      // Driven by the release wrappers with a candidate identity; it has its own
      // config and fails closed without `GENIE_SMOKE_IMAGE`.
      "testing/release-smoke.integration.test.ts",
    ],
    passWithNoTests: false,
    testTimeout: 240000,
    hookTimeout: 240000,
    // The image tests bind fixed host ports, so they must not run beside each other.
    fileParallelism: false,
  },
});
