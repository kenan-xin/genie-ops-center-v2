import type { ViteUserConfig } from "vitest/config";

/** The shared unit-test preset. Every package merges it in its own vitest.config.ts. */
export const unitTestPreset: ViteUserConfig = {
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.stories.*", "e2e/**"],
    restoreMocks: true,
    passWithNoTests: false,
  },
};
