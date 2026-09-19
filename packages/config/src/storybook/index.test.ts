import { describe, expect, it } from "vitest";

import { sharedStorybookConfig } from "./index.ts";

describe("the reserved Storybook configuration extension point", () => {
  it("stays build-safe, so importing it starts no service and reads no environment value", () => {
    expect(sharedStorybookConfig.stories).toEqual([]);
    expect(sharedStorybookConfig.addons).toEqual([]);
  });

  it("names S0-02 as its owner, so nobody fills it in here by accident", () => {
    expect(sharedStorybookConfig.owner).toBe("S0-02");
  });
});
