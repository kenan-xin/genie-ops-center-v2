import { defineConfig } from "vitest/config";

/**
 * The repository-wide workspace checks. They live in their own collection, so the
 * unit run never shells out to Nx, and the Nx `validate` target can declare its
 * own workspace-wide inputs.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/workspace/validate/**/*.test.ts"],
    restoreMocks: true,
    passWithNoTests: false,
  },
});
