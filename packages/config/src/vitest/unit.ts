import type { ViteUserConfig } from "vitest/config";

/**
 * Where a unit test lives. `contracts/` is a top-level source folder beside `src/`, so it needs
 * its own entry. `testing/` is absent on purpose: it holds real-database integration tests that
 * need a disposable Postgres, and those run under their own preset.
 */
export const UNIT_TEST_INCLUDE: readonly string[] = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "contracts/**/*.test.ts",
  "contracts/**/*.test.tsx",
];

export const UNIT_TEST_EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.stories.*",
  "testing/**",
  "e2e/**",
];

/** The shared unit-test preset. Every package merges it in its own vitest.config.ts. */
export const unitTestPreset: ViteUserConfig = {
  test: {
    name: "unit",
    environment: "node",
    include: [...UNIT_TEST_INCLUDE],
    exclude: [...UNIT_TEST_EXCLUDE],
    restoreMocks: true,
    passWithNoTests: false,
  },
};
