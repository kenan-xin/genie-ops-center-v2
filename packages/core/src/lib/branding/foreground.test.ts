import { colorRoles } from "@genie/ui/tokens";
import { describe, expect, it } from "vitest";

import { contrastRatio, foregroundFor } from "./foreground.ts";

describe("contrastRatio", () => {
  it("matches the ratios tokens.md measured, in either order", () => {
    expect(contrastRatio("#2563eb", "#ffffff")).toBeCloseTo(5.17, 2);
    expect(contrastRatio("#ffffff", "#2563eb")).toBeCloseTo(5.17, 2);
    expect(contrastRatio("#60a5fa", "#030712")).toBeCloseTo(7.92, 2);
  });

  it("holds the fixed --brand-on-dark at 3:1 or more on every dark surface (AC-1, R-15)", () => {
    for (const surface of ["background", "card", "muted"] as const) {
      expect(
        contrastRatio(
          colorRoles.dark["brand-on-dark"],
          colorRoles.dark[surface]
        )
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

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
