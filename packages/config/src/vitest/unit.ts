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
  // Transient lint fixtures the boundary suites write into a package's `src` and
  // delete again. They are test-shaped (`__boundary__.test.ts`), so a concurrent
  // unit run that globbed one would import a file that is already gone
  // (genie-ops-center-v2-7lj). The markers are the same ones the root tsconfig
  // and `.eslintignore` exclude, and no real test file carries one.
  //
  // Each pattern matches its marker anywhere inside a path segment, not only at
  // the start, so a mid-basename fixture such as `probe.__boundary__.test.ts` is
  // excluded too; a prefix-only entry would collect it (genie-ops-center-v2-5hq).
  "**/*__boundary__*",
  "**/*__wiring__*",
  "**/*__antislop__*",
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
    // A share of the machine, not a count: vitest would otherwise fork one worker
    // per CPU inside every project, and Nx already runs several projects at once,
    // so the two layers multiply into heavy oversubscription. A quarter share
    // under Nx's four concurrent tasks saturates any machine without thrashing.
    maxWorkers: "25%",
  },
};
