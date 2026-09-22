import { describe, expect, it } from "vitest";

import { themeTokens } from "./tokens.ts";

describe("the shared theme tokens", () => {
  it("gives the light and dark themes different surfaces and foregrounds", () => {
    expect(themeTokens.light.surface).not.toBe(themeTokens.dark.surface);
    expect(themeTokens.light.foreground).not.toBe(themeTokens.dark.foreground);
  });

  it("carries a non-empty surface and foreground for every theme", () => {
    for (const token of Object.values(themeTokens)) {
      expect(token.surface).not.toBe("");
      expect(token.foreground).not.toBe("");
    }
  });
});
