import { describe, expect, it } from "vitest";

import { componentTestPreset } from "./component.ts";
import { unitTestPreset } from "./unit.ts";

describe("componentTestPreset", () => {
  it("runs in a real browser, headless, on chromium", () => {
    expect(componentTestPreset.test?.browser?.enabled).toBe(true);
    expect(componentTestPreset.test?.browser?.headless).toBe(true);
    expect(componentTestPreset.test?.browser?.instances).toEqual([
      { browser: "chromium" },
    ]);
  });

  it("names its project so the two collections stay separate", () => {
    expect(componentTestPreset.test?.name).toBe("storybook");
    expect(unitTestPreset.test?.name).not.toBe("storybook");
  });

  it("never collects a story as a unit test", () => {
    expect(unitTestPreset.test?.exclude).toContain("**/*.stories.*");
  });
});
