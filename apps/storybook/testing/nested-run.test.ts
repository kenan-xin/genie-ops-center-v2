import { describe, expect, it } from "vitest";

import { RACE_OUTPUT } from "./import-race-output.ts";
import { isBrowserImportRace } from "./nested-run.ts";

describe("isBrowserImportRace", () => {
  it("recognises the develop run's failed setup-file import", () => {
    expect(isBrowserImportRace(RACE_OUTPUT)).toBe(true);
  });

  // A failed or mixed story run is proved never retried in test-storybook.test.ts.
  it("rejects an unrelated failure", () => {
    expect(isBrowserImportRace("Error: Unknown module id does-not-exist")).toBe(
      false
    );
  });
});
