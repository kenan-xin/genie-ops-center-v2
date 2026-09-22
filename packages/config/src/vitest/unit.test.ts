import { describe, expect, it } from "vitest";

import {
  UNIT_TEST_EXCLUDE,
  UNIT_TEST_INCLUDE,
  unitTestPreset,
} from "./unit.ts";

describe("unitTestPreset", () => {
  it("restores mocks between tests so one test cannot leak into the next", () => {
    expect(unitTestPreset.test?.restoreMocks).toBe(true);
  });

  it("fails an empty run instead of passing a collection that found nothing", () => {
    expect(unitTestPreset.test?.passWithNoTests).toBe(false);
  });

  it("caps workers at a share of the machine, so Nx and vitest do not multiply", () => {
    // A count would assume one machine shape; the percentage scales with it.
    expect(unitTestPreset.test?.maxWorkers).toBe("25%");
  });

  it("collects unit tests from src and from the top-level contracts folder", () => {
    expect(unitTestPreset.test?.include).toEqual([...UNIT_TEST_INCLUDE]);
    expect(UNIT_TEST_INCLUDE).toContain("src/**/*.test.ts");
    expect(UNIT_TEST_INCLUDE).toContain("contracts/**/*.test.ts");
  });

  it("keeps integration tests under testing out of the unit collection", () => {
    expect(
      UNIT_TEST_INCLUDE.some((pattern) => pattern.startsWith("testing/"))
    ).toBe(false);
    expect(unitTestPreset.test?.exclude).toContain("testing/**");
  });

  it("leaves browser stories and end-to-end files out of the unit collection", () => {
    expect(UNIT_TEST_EXCLUDE).toContain("**/*.stories.*");
    expect(UNIT_TEST_EXCLUDE).toContain("e2e/**");
  });
});
