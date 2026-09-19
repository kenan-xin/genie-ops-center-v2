import { describe, expect, it } from "vitest";

import { tailwindPreset } from "./preset.ts";

describe("the shared Tailwind preset", () => {
  it("defines no colour, because packages/ui owns the design tokens", () => {
    expect(tailwindPreset.theme?.extend?.colors).toBeUndefined();
  });

  it("names the content globs every package shares", () => {
    expect(tailwindPreset.content).toContain("./src/**/*.{ts,tsx}");
  });

  it("carries no empty presets list, because Tailwind 4 rejects one at load time", () => {
    expect(tailwindPreset.presets).toBeUndefined();
  });
});
