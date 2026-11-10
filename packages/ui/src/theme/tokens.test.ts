import { describe, expect, it } from "vitest";

import {
  categoryColors,
  categoryChipClasses,
  chartColors,
  colorRoles,
  fieldHeight,
  fieldHeightPx,
  focusRing,
  spacingPx,
} from "./tokens.ts";

function linear(value: number): number {
  const unit = value / 255;

  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function channel(digits: string, at: number): number {
  return linear(Number.parseInt(digits.slice(at, at + 2), 16));
}

/** WCAG 2.1 relative luminance of an `#rrggbb` color. */
function luminance(hex: string): number {
  const digits = hex.replace("#", "");

  return (
    0.2126 * channel(digits, 0) +
    0.7152 * channel(digits, 2) +
    0.0722 * channel(digits, 4)
  );
}

function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

type Oklab = { readonly l: number; readonly a: number; readonly b: number };

/** OKLab of an `#rrggbb` color, for a perceptual distance between two colors. */
function oklab(hex: string): Oklab {
  const digits = hex.replace("#", "");
  const r = channel(digits, 0);
  const g = channel(digits, 2);
  const b = channel(digits, 4);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function distance(a: string, b: string): number {
  const x = oklab(a);
  const y = oklab(b);

  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

describe("the fixed token layer against tokens.md", () => {
  it("gives every field 36 px from lg and 44 px under it, in the class it ships", () => {
    const { desktop, touch } = fieldHeightPx;

    expect(fieldHeight).toBe(
      `h-${touch / spacingPx} min-h-${touch / spacingPx} lg:h-${desktop / spacingPx} lg:min-h-${desktop / spacingPx}`
    );
    expect(fieldHeightPx).toEqual({ desktop: 36, touch: 44 });
  });

  // czjw.65 (I6): a placeholder must read, but never as a value the person entered.
  it("keeps the placeholder readable on the card and apart from the value text", () => {
    for (const theme of ["light", "dark"] as const) {
      const roles = colorRoles[theme];

      expect(
        contrastRatio(roles.placeholder, roles.card)
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      contrastRatio(colorRoles.light.foreground, colorRoles.light.placeholder)
    ).toBeGreaterThanOrEqual(3);
  });

  it("holds the one focus ring, colored only through --ring (R-8)", () => {
    expect(focusRing).toBe(
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    );
  });
});

describe("the event category tones against tokens.md, Category colors", () => {
  // SAFETY: Object.keys answers the keys of the record it is given.
  const names = Object.keys(categoryColors) as (keyof typeof categoryColors)[];

  it("keeps every category chip text at 4.5:1 on its own fill, in both themes", () => {
    for (const name of names) {
      const tones = categoryColors[name];

      for (const theme of ["light", "dark"] as const) {
        const ratio = contrastRatio(tones[theme].text, tones[theme].background);

        expect(
          ratio,
          `${name} in ${theme} measures ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps every category clear of the status colors and the default primary", () => {
    for (const name of names) {
      for (const theme of ["light", "dark"] as const) {
        for (const [role, hex] of [
          ["success", "#047857"],
          ["warning", "#b45309"],
          ["danger", "#b91c1c"],
          ["primary", "#2563eb"],
        ] as const) {
          const apart = distance(categoryColors[name][theme].text, hex);

          expect(
            apart,
            `${name} in ${theme} sits ${apart.toFixed(1)} from ${role}`
          ).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });

  it("names a chip class for every category it colors", () => {
    expect(Object.keys(categoryChipClasses).toSorted()).toEqual(
      Object.keys(categoryColors).toSorted()
    );
  });
});

describe("the chart series colors against tokens.md, Chart series colors", () => {
  it("keeps chart neighbors 15 apart and every slot visible on the card", () => {
    for (const [theme, card, minimum] of [
      ["light", "#ffffff", 2],
      ["dark", "#111827", 3],
    ] as const) {
      const slots = chartColors[theme];

      for (const [index, slot] of slots.entries()) {
        const ratio = contrastRatio(slot, card);

        expect(
          ratio,
          `slot ${index + 1} in ${theme} measures ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(minimum);

        const next = slots[index + 1];

        if (next !== undefined) {
          const apart = distance(slot, next);

          expect(
            apart,
            `slots ${index + 1} and ${index + 2} in ${theme} sit ${apart.toFixed(1)} apart`
          ).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });
});
