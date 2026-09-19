import { describe, expect, it } from "vitest";

import { sharedOxlintConfig } from "./index.ts";

describe("the shared Oxlint configuration", () => {
  it("ignores build output and the vendored plugin, which is not ours to lint", () => {
    expect(sharedOxlintConfig.ignorePatterns).toContain("**/dist/**");
    expect(sharedOxlintConfig.ignorePatterns).toContain(
      "packages/config/oxlint/anti-slop/**"
    );
  });

  it("treats a correctness problem as an error rather than a warning", () => {
    expect(sharedOxlintConfig.categories?.correctness).toBe("error");
  });
});
