import { describe, expect, it } from "vitest";

import { unitTestPreset } from "./unit.ts";

// What the collection includes and excludes is proved by a real vitest run in
// `packages/core/src/package-targets.test.ts`, not by restating the globs here.

describe("unitTestPreset", () => {
  it("restores mocks between tests so one test cannot leak into the next", () => {
    expect(unitTestPreset.test?.restoreMocks).toBe(true);
  });

  it("fails an empty run instead of passing a collection that found nothing", () => {
    expect(unitTestPreset.test?.passWithNoTests).toBe(false);
  });
});
