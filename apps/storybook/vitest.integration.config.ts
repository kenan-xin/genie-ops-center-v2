import { defineConfig } from "vitest/config";

/**
 * The Storybook host's own real-build tests.
 *
 * They live under `testing/`, which the fast unit project deliberately excludes,
 * because each case stages the workspace and drives real `build-storybook` and
 * `test-storybook` runs. `passWithNoTests` stays false, so a file that stops
 * matching fails this target rather than reporting a quiet success.
 *
 * The runs share one staged workspace and one Nx cache, so they must not run
 * beside each other.
 */
export default defineConfig({
  test: {
    name: "storybook-integration",
    environment: "node",
    include: ["testing/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    testTimeout: 300000,
    hookTimeout: 300000,
    fileParallelism: false,
  },
});
