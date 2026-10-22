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

  it("excludes tests, stories, fixtures and generated output from coverage", () => {
    const exclude = unitTestPreset.test?.coverage?.exclude ?? [];

    expect(exclude).toContain("**/*.test.ts");
    expect(exclude).toContain("**/*.test.tsx");
    expect(exclude).toContain("**/*.stories.*");
    expect(exclude).toContain("**/fixtures/**");
    expect(exclude).toContain("apps/genie/src/modules.ts");
    // The same transient markers the unit collection already skips.
    expect(exclude).toContain("**/*__boundary__*");
    expect(exclude).toContain("**/*__wiring__*");
    expect(exclude).toContain("**/*__antislop__*");
    expect(exclude).toContain("**/*__shadcn__*");
  });
});
