import { describe, expect, it } from "vitest";

import {
  approvedFonts,
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
