import { describe, expect, it } from "vitest";

import { unitTestPreset } from "./unit.ts";

describe("unitTestPreset", () => {
  it("restores mocks between tests so one test cannot leak into the next", () => {
    expect(unitTestPreset.test?.restoreMocks).toBe(true);
  });

  it("fails an empty run instead of passing a collection that found nothing", () => {
    expect(unitTestPreset.test?.passWithNoTests).toBe(false);
  });

  it("collects only unit test files and leaves browser and end-to-end files alone", () => {
    expect(unitTestPreset.test?.include).toEqual([
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ]);
    expect(unitTestPreset.test?.exclude).toContain("**/*.stories.*");
    expect(unitTestPreset.test?.exclude).toContain("e2e/**");
  });
});
