import { describe, expect, it } from "vitest";

import {
  FAILED_STORY,
  RACE_AND_FAILED_STORY,
  RACE_OUTPUT,
} from "./import-race-output.ts";
import { isBrowserImportRace } from "./nested-run.ts";

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
