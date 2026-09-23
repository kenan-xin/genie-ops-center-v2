/**
 * The one nested-run failure the Storybook matrix retries.
 *
 * On a loaded CI runner, Vitest browser mode sometimes fails the first import of
 * a test file with `Failed to fetch dynamically imported module`, although the
 * same server serves the same file to every later file of the run
 * (vitest-dev/vitest#9509, still open and unreproduced upstream). Develop run
 * 35871795291 failed this way on the addon's setup file. The browser server logs
 * no optimizer run, no reload and no transform error in that output, so neither
 * the stage nor the Storybook configuration caused it.
 *
 * The retry is narrow: a single import failure with no failed test. A story that
 * fails, or a setup file that can never be fetched, still fails the case.
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

/** Runs once, and once more only after the import race. The second result stands. */
export function retryImportRace(runOnce: () => Run): Run {
  const first = runOnce();

  if (first.status === 0 || !isBrowserImportRace(first.output)) return first;

  return runOnce();
}
