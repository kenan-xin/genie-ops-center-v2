/**
 * The one browser-mode failure the Storybook component-test target retries.
 *
 * On a loaded CI runner, Vitest browser mode sometimes fails the first import of
 * a test file with `Failed to fetch dynamically imported module`, although the
 * same server serves the same file to every later file of the run
 * (vitest-dev/vitest#11171: load-dependent, warm cache, also on Vitest 5.0.0,
 * closed 2026-09-11 without a reproduction or fix; #9509 is a different,
 * optimizeDeps-caused failure). Develop run
 * 35871795291 failed this way on the addon's setup file. The browser server logs
 * no optimizer run, no reload and no transform error in that output, so neither
 * the stage nor the Storybook configuration caused it.
 *
 * The retry itself lives in `test-storybook.ts`, the wrapper the Nx target runs.
 * It is narrow: a single import failure with no failed test. A story that fails,
 * or a setup file that can never be fetched, still fails the run.
 */
export type Run = {
  readonly status: number;
  readonly output: string;
};

const IMPORT_RACE =
  /Failed to import test file [^\n]*\n\s*Caused by: TypeError: Failed to fetch dynamically imported module/;

/** Vitest's summary line for tests, which names a count only when one failed. */
const FAILED_TESTS = /^\s*Tests\s.*\bfailed\b/m;

export function isBrowserImportRace(output: string): boolean {
  return IMPORT_RACE.test(output) && !FAILED_TESTS.test(output);
}
