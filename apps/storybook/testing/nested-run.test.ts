import { describe, expect, it } from "vitest";

import { isBrowserImportRace, retryImportRace } from "./nested-run.ts";

/**
 * The nested `test-storybook` output of develop run 35871795291, cut to the
 * lines the predicate reads. Four files imported the addon's setup file from
 * the same server; only the first file's import failed, and no test failed.
 */
const RACE_OUTPUT = ` RUN  v4.1.11 /tmp/genie-storybook-matrix-XliQDe/apps/storybook

 ❯  storybook (chromium)  ../../packages/ui/src/disclosure/disclosure.stories.tsx (0 test)
 ✓  storybook (chromium)  ../../packages/ui/src/theme/theme-provider.stories.tsx (2 tests) 261ms

 Test Files  1 failed | 4 passed (5)
      Tests  9 passed (9)

 FAIL   storybook (chromium)  ../../packages/ui/src/disclosure/disclosure.stories.tsx [ ../../packages/ui/src/disclosure/disclosure.stories.tsx ]
Error: Failed to import test file /tmp/genie-storybook-matrix-XliQDe/node_modules/.pnpm/@storybook+addon-vitest@10.6.0/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file-with-project-annotations.js
Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:63315/tmp/genie-storybook-matrix-XliQDe/node_modules/.pnpm/@storybook+addon-vitest@10.6.0/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file-with-project-annotations.js?import&browserv=1790173057537
`;

/** The same import failure beside a story that really failed. */
const RACE_AND_FAILED_STORY = RACE_OUTPUT.replace(
  "Tests  9 passed (9)",
  "Tests  1 failed | 8 passed (9)"
);

const FAILED_STORY = ` Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 15 passed (16)

 FAIL  |storybook (chromium)| ../../packages/ui/src/__matrix__/broken.stories.tsx > Interaction Fails
TestingLibraryElementError: Unable to find an element with the text: this text is not rendered.
`;

describe("isBrowserImportRace", () => {
  it("recognises the develop run's failed setup-file import", () => {
    expect(isBrowserImportRace(RACE_OUTPUT)).toBe(true);
  });

  it("rejects a run in which a story failed", () => {
    expect(isBrowserImportRace(FAILED_STORY)).toBe(false);
    expect(isBrowserImportRace(RACE_AND_FAILED_STORY)).toBe(false);
  });

  it("rejects an unrelated failure", () => {
    expect(isBrowserImportRace("Error: Unknown module id does-not-exist")).toBe(
      false
    );
  });
});

/** A fake nested run that answers the given results in order, then repeats the last. */
function runs(...results: { status: number; output: string }[]) {
  let calls = 0;

  const next = () => {
    const result = results[calls] ?? results.at(-1);

    calls += 1;

    if (result === undefined) throw new Error("no result");

    return result;
  };

  return { next, calls: () => calls };
}

describe("retryImportRace", () => {
  it("runs once more after the import race and returns the second result", () => {
    const fake = runs(
      { status: 1, output: RACE_OUTPUT },
      { status: 0, output: "ok" }
    );

    expect(retryImportRace(fake.next)).toEqual({ status: 0, output: "ok" });
    expect(fake.calls()).toBe(2);
  });

  it("retries only once, so a race that repeats still fails", () => {
    const fake = runs({ status: 1, output: RACE_OUTPUT });

    expect(retryImportRace(fake.next).status).toBe(1);
    expect(fake.calls()).toBe(2);
  });

  it("never retries a failed story or a pass", () => {
    const failed = runs({ status: 1, output: FAILED_STORY });
    const passed = runs({ status: 0, output: RACE_OUTPUT });

    expect(retryImportRace(failed.next).status).toBe(1);
    expect(failed.calls()).toBe(1);
    expect(retryImportRace(passed.next).status).toBe(0);
    expect(passed.calls()).toBe(1);
  });
});
