import { colorRoles } from "@genie/ui/tokens";
import { describe, expect, it } from "vitest";

import {
  brandingContrastPairs,
  type ContrastPair,
  contrastAllowsPublish,
  signInContrastPairs,
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

function levels(graded: readonly ContrastPair[]) {
  return Object.fromEntries(graded.map((pair) => [pair.id, pair.level]));
}

describe("brandingContrastPairs (R-46, AC-17)", () => {
  it("passes all four pairs for the default blue", () => {
    const result = pairs("#2563eb");

    expect(result["fill"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["text-on-nav"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["count-pill"]?.ratio).toBeCloseTo(5.17, 2);
    expect(result["focus-ring"]?.ratio).toBeCloseTo(4.95, 2);
    expect(levels(brandingContrastPairs("#2563eb"))).toEqual({
      "fill": "pass",
      "text-on-nav": "pass",
      "count-pill": "pass",
      "focus-ring": "pass",
    });
  });

  // CR-BRANDING-L2: below 3:1 a pair blocks Publish, a text pair under 4.5:1 only warns, and the
  // ring has no warning band.
  it.each([
    ["#ca8a04", 2.94, "fail", "fail", false],
    ["#ec4899", 3.53, "warning", "pass", true],
    ["#db2777", 4.6, "pass", "pass", true],
  ] as const)(
    "grades %s, %s:1 on the text pairs, as %s with the ring %s (Publish allowed: %s)",
    (color, ratio, text, ring, allowed) => {
      const graded = brandingContrastPairs(color);

      expect(levels(graded)).toEqual({
        "fill": text,
        "text-on-nav": text,
        "count-pill": text,
        "focus-ring": ring,
      });

      for (const pair of graded.filter((each) => each.target === 4.5))
        expect(pair.ratio).toBeCloseTo(ratio, 2);

      expect(contrastAllowsPublish(graded)).toBe(allowed);
    }
  );

  it("fails Text on nav and Focus ring for a light blue that keeps its dark foreground", () => {
    const result = pairs("#93c5fd");

    expect(result["fill"]).toMatchObject({ level: "pass" });
    expect(result["count-pill"]).toMatchObject({ level: "pass" });
    expect(result["fill"]?.ratio).toBeCloseTo(9.84, 2);
    expect(result["text-on-nav"]).toMatchObject({ level: "fail" });
    expect(result["text-on-nav"]?.ratio).toBeCloseTo(1.8, 2);
    expect(result["focus-ring"]).toMatchObject({ level: "fail" });
    expect(result["focus-ring"]?.ratio).toBeCloseTo(1.73, 2);
    expect(contrastAllowsPublish(brandingContrastPairs("#93c5fd"))).toBe(false);
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

// DR-05: the light theme's --foreground and --muted-foreground on the sign-in background, the
// lower ratio of the two.
describe("signInContrastPairs (R-46, AC-17)", () => {
  it.each([
    ["#22aaee", 2.9, "fail", false],
    ["#55bbee", 3.5, "warning", true],
    ["#aaccff", 4.6, "pass", true],
  ] as const)(
    "grades the sign-in text on %s, %s:1, as %s (Publish allowed: %s)",
    (background, ratio, level, allowed) => {
      const graded = signInContrastPairs(background);

      expect(graded).toEqual([
        {
          id: "sign-in-text",
          ratio: expect.closeTo(ratio, 2),
          target: 4.5,
          level,
        },
      ]);
      expect(contrastAllowsPublish(graded)).toBe(allowed);
    }
  );
});
