import { describe, expect, it } from "vitest";

import { foregroundFor } from "./foreground.ts";

describe("foregroundFor", () => {
  it("uses near-black text for a light primary color", () => {
    expect(foregroundFor("#f8fafc")).toBe("#111827");
  });

  it("uses white text for a dark primary color", () => {
    expect(foregroundFor("#1d4ed8")).toBe("#ffffff");
  });

  it("falls back to white for a value that is not a six-digit hex color", () => {
    expect(foregroundFor("nothex")).toBe("#ffffff");
  });
});
