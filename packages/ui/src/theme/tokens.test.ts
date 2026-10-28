import { describe, expect, it } from "vitest";

import {
  approvedFonts,
  categoryColors,
  categoryChipClasses,
  colorRoles,
  controlHeightsPx,
  defaultControlHeight,
  defaultFont,
  defaultFontSizePreset,
  focusRing,
  fontSizePresetsPx,
  monoFont,
  motion,
  radiusPx,
  spacingPx,
  typeScale,
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
  it("binds each of the six type roles to one size and one weight, and steps display and title down on phones", () => {
    expect(typeScale).toEqual({
      display: { size: "text-2xl", phoneSize: "text-xl", weight: "font-bold" },
      title: { size: "text-xl", phoneSize: "text-lg", weight: "font-bold" },
      heading: { size: "text-lg", weight: "font-semibold" },
      body: { size: "text-base", weight: "font-normal" },
      secondary: { size: "text-sm", weight: "font-normal" },
      caption: { size: "text-xs", weight: "font-medium" },
    });
  });

  it("keeps three fixed control heights on the 4 px spacing base, with 40 px the default", () => {
    expect(controlHeightsPx).toEqual({ sm: 32, md: 40, lg: 44 });
    expect(defaultControlHeight).toBe("md");
    // h-8, h-10 and h-11: each height is a whole number of spacing steps.
    expect(Object.values(controlHeightsPx).map((px) => px / spacingPx)).toEqual(
      [8, 10, 11]
    );
  });

  it("rounds menus at 6 px, controls at 8 px and cards at 12 px", () => {
    expect(radiusPx).toEqual({ menu: 6, control: 8, card: 12 });
  });

  it("moves for 150 ms, inside the 150 to 220 ms band, on an ease-out curve", () => {
    expect(motion).toEqual({
      minDurationMs: 150,
      maxDurationMs: 220,
      durationMs: 150,
      easing: "cubic-bezier(0, 0, 0.2, 1)",
    });
  });

  it("gives every color role its tokens.md value in both themes", () => {
    expect(colorRoles).toEqual({
      light: {
        "background": "#ffffff",
        "foreground": "#111827",
        "card": "#ffffff",
        "muted": "#f9fafb",
        "muted-foreground": "#4b5563",
        "border": "#e5e7eb",
        "input": "#6b7280",
        "ring": "var(--primary)",
        "primary": "#2563eb",
        "primary-foreground": "#ffffff",
        "destructive": "#dc2626",
        "brand-on-dark": "#60a5fa",
        "destructive-on-dark": "#f87171",
      },
      dark: {
        "background": "#030712",
        "foreground": "#f3f4f6",
        "card": "#111827",
        "muted": "#111827",
        "muted-foreground": "#9ca3af",
        "border": "#1f2937",
        "input": "#6b7280",
        "ring": "var(--brand-on-dark)",
        "primary": "#2563eb",
        "primary-foreground": "#ffffff",
        "destructive": "#dc2626",
        "brand-on-dark": "#60a5fa",
        "destructive-on-dark": "#f87171",
      },
    });
  });

  it("offers the compact, default and large root sizes, with 15 px the default", () => {
    expect(fontSizePresetsPx).toEqual({ compact: 14, default: 15, large: 16 });
    expect(defaultFontSizePreset).toBe("default");
  });

  it("approves only the default face until the Typography tab reopens", () => {
    expect(approvedFonts).toEqual(["plus-jakarta-sans"]);
    expect(defaultFont).toBe("plus-jakarta-sans");
    expect(monoFont).toBe("jetbrains-mono");
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
