import { describe, expect, it } from "vitest";

import {
  FAILED_STORY,
  RACE_AND_FAILED_STORY,
  RACE_OUTPUT,
} from "./import-race-output.ts";
import { RETRY_NOTICE, VITEST_ARGS, runWithRetry } from "./test-storybook.ts";

// An empty story collection must fail the target, not pass it quietly.
it("keeps passWithNoTests off for the component run", () => {
  expect(VITEST_ARGS).toContain("--passWithNoTests=false");
});

/**
 * The decision the `test-storybook` wrapper makes around a Vitest run. The
 * wrapper's real spawn is replaced by a fake run, so these cases prove the
 * retry policy without a browser, a stage or a Storybook build.
 */

/** A fake run that answers the given results in order, then repeats the last. */
function runs(...results: { status: number; output: string }[]) {
  let calls = 0;

  const next = async () => {
    const result = results[calls] ?? results.at(-1);

    calls += 1;

    if (result === undefined) throw new Error("no result");

    return result;
  };

  return { next, calls: () => calls };
}

describe("runWithRetry", () => {
  it("retries once on the import race and returns the second result", async () => {
    const fake = runs(
      { status: 1, output: RACE_OUTPUT },
      { status: 0, output: "ok" }
    );

    const notices: string[] = [];

    const result = await runWithRetry(fake.next, () => {
      notices.push(RETRY_NOTICE);
    });

    expect(result).toEqual({ status: 0, output: "ok" });
    expect(fake.calls()).toBe(2);
    expect(notices).toEqual([RETRY_NOTICE]);
    expect(RETRY_NOTICE).toContain("11171");
  });

  it("exits with the second run's code when the retry fails too", async () => {
    const fake = runs(
      { status: 1, output: RACE_OUTPUT },
      { status: 3, output: "still broken" }
    );

    expect((await runWithRetry(fake.next, () => {})).status).toBe(3);
    expect(fake.calls()).toBe(2);
  });

  it("retries only once, so a race that repeats still fails", async () => {
    const fake = runs({ status: 1, output: RACE_OUTPUT });

    expect((await runWithRetry(fake.next, () => {})).status).toBe(1);
    expect(fake.calls()).toBe(2);
  });

  it("never retries a failed story, a mixed failure, or a pass", async () => {
    const failed = runs({ status: 1, output: FAILED_STORY });
    const mixed = runs({ status: 1, output: RACE_AND_FAILED_STORY });
    const passed = runs({ status: 0, output: RACE_OUTPUT });

    expect((await runWithRetry(failed.next, () => {})).status).toBe(1);
    expect(failed.calls()).toBe(1);
    expect((await runWithRetry(mixed.next, () => {})).status).toBe(1);
    expect(mixed.calls()).toBe(1);
    expect((await runWithRetry(passed.next, () => {})).status).toBe(0);
    expect(passed.calls()).toBe(1);
  });
});
