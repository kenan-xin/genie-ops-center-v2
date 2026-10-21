import { defineConfig } from "vitest/config";

/**
 * The repository-wide workspace checks. They live in their own Nx project, whose
 * `validate` target declares the workspace-wide inputs they read, so no unit run
 * replays them against a stale hash.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    passWithNoTests: false,
  },
});
