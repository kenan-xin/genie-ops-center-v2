import { defineConfig } from "vitest/config";

/**
 * The app's real-service tests. They live under `testing/`, which the unit preset excludes on
 * purpose, so without this configuration they are collected by nothing and a green unit run
 * would say nothing about the image at all.
 *
 * These tests drive the actual built image, so `docker build -f deploy/Dockerfile
 * --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .` must have run first. They take a
 * disposable Postgres and never mock the database (R-38).
 *
 * `passWithNoTests` stays false, so a file that stops matching fails this target rather than
 * reporting a quiet success. The timeouts are the image start and the container lifecycle, not
 * the assertions.
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
    // The image tests bind fixed host ports and share one disposable database, so they must not
    // run beside each other.
    fileParallelism: false,
  },
});
