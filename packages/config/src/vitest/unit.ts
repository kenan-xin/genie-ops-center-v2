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

// Transient lint fixtures the boundary suites write into a package's `src` and
// delete again. They are test-shaped (`__boundary__.test.ts`), so a concurrent
// unit run that globbed one would import a file that is already gone
// (genie-ops-center-v2-7lj). The markers are the same ones the root tsconfig
// and `.eslintignore` exclude, and no real test file carries one.
//
// Each pattern matches its marker anywhere inside a path segment, not only at
// the start, so a mid-basename fixture such as `probe.__boundary__.test.ts` is
// excluded too; a prefix-only entry would collect it (genie-ops-center-v2-5hq).
const TRANSIENT_FIXTURE_MARKERS: readonly string[] = [
  "**/*__boundary__*",
  "**/*__wiring__*",
  "**/*__antislop__*",
  "**/*__shadcn__*",
];

export const UNIT_TEST_EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.stories.*",
  "testing/**",
  "e2e/**",
  ...TRANSIENT_FIXTURE_MARKERS,
];

/**
 * What the coverage run never measures. The tests and stories themselves, the
 * fixtures and generated output beside them, and the same transient markers the
 * collection already skips. Everything else that a test loaded is measured, so
 * the report is the source the suite exercised.
 */
export const UNIT_COVERAGE_EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.stories.*",
  "**/*.d.ts",
  "**/testing/**",
  "**/fixtures/**",
  "e2e/**",
  // Generated at build time from MODULE_INCLUDE. Never source (ADR 0008).
  "apps/genie/src/modules.ts",
  ...TRANSIENT_FIXTURE_MARKERS,
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
    // Local only. `enabled: false` leaves an ordinary `vitest run` untouched, so
    // `--coverage` is the only way to turn it on. `json` and `lcov` are the
    // standard machine-readable reports; the text summary is the terminal view.
    // Reports land in each project's gitignored `coverage/` directory. SuperCov
    // instruments its own isolated copy and does not read these.
    coverage: {
      provider: "v8",
      enabled: false,
      reporter: ["text-summary", "json", "lcov"],
      exclude: [...UNIT_COVERAGE_EXCLUDE],
    },
  },
};
