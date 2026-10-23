import { colorRoles } from "@genie/ui/tokens";
import { describe, expect, it } from "vitest";

import {
  brandingContrastPairs,
  brandingContrastPasses,
} from "./contrast-pairs.ts";
import { contrastRatio } from "./foreground.ts";

// R-68, WCAG 1.4.11: the input border is a component boundary, so it holds 3:1 on every surface.
it.each(["light", "dark"] as const)(
  "holds the %s input border at 3:1 against the card and the page (R-68, AC-17)",
  (theme) => {
    const roles = colorRoles[theme];

    expect(contrastRatio(roles.input, roles.card)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(roles.input, roles.background)).toBeGreaterThanOrEqual(
      3
    );
  }
);

function pairs(primaryColor: string) {
  return Object.fromEntries(
    brandingContrastPairs(primaryColor).map((pair) => [pair.id, pair])
  );
}

describe("brandingContrastPairs (R-46, AC-17)", () => {
  it("passes all four pairs for the default blue", () => {
    const result = pairs("#2563eb");

    expect(result["fill"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["text-on-nav"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["count-pill"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["focus-ring"]?.ratio).toBeCloseTo(4.95, 2);
    expect(brandingContrastPasses("#2563eb")).toBe(true);
  });

  it("fails Fill, Count pill and Text on nav for a mid blue, while the ring passes at 3:1", () => {
    const result = pairs("#3b82f6");

    expect(result["fill"]).toMatchObject({ ok: false, target: 4.5 });
    expect(result["count-pill"]).toMatchObject({ ok: false, target: 4.5 });
    expect(result["text-on-nav"]).toMatchObject({ ok: false, target: 4.5 });
    expect(result["focus-ring"]).toMatchObject({ ok: true, target: 3 });
    expect(result["fill"]?.ratio).toBeCloseTo(3.68, 2);
    expect(result["focus-ring"]?.ratio).toBeCloseTo(3.52, 2);
  });

  it("fails Text on nav and Focus ring for a light blue that keeps its dark foreground", () => {
    const result = pairs("#93c5fd");

    expect(result["fill"]).toMatchObject({ ok: true });
    expect(result["count-pill"]).toMatchObject({ ok: true });
    expect(result["fill"]?.ratio).toBeCloseTo(9.84, 2);
    expect(result["text-on-nav"]).toMatchObject({ ok: false });
    expect(result["text-on-nav"]?.ratio).toBeCloseTo(1.8, 2);
    expect(result["focus-ring"]).toMatchObject({ ok: false });
    expect(result["focus-ring"]?.ratio).toBeCloseTo(1.73, 2);
    expect(brandingContrastPasses("#93c5fd")).toBe(false);
  });

  it("returns the four pairs in the pill order", () => {
    expect(brandingContrastPairs("#2563eb").map((pair) => pair.id)).toEqual([
      "fill",
      "text-on-nav",
      "count-pill",
      "focus-ring",
    ]);
  });
});
