import { colorRoles } from "@genie/ui/tokens";
import { describe, expect, it } from "vitest";

import { brandingTokens } from "./tokens.ts";

// A variable, not a literal, so that it carries the extra row fields without an excess-property error.
const seeded = {
  primaryColor: "#0f766e",
  primaryForeground: "#ffffff",
  fontSize: "large",
  fontFamily: "manrope",
  textColor: "#000000",
  loginBackgroundColor: null,
};

describe("brandingTokens", () => {
  it("emits the tenant pair, the preset root size and the default face, and nothing else", () => {
    expect(brandingTokens(seeded)).toEqual({
      "--primary": "#0f766e",
      "--primary-foreground": "#ffffff",
      "font-size": "16px",
      "--font-sans": "var(--font-face-plus-jakarta-sans)",
      "--sign-in-background": "var(--background)",
    });
  });

  it.each([
    ["#f5f5f4", "#f5f5f4"],
    ["red;}</style>", "var(--background)"],
  ])(
    "emits the sign-in background for %j as %j (R-54)",
    (loginBackgroundColor, expected) => {
      expect(
        brandingTokens({ ...seeded, loginBackgroundColor })[
          "--sign-in-background"
        ]
      ).toBe(expected);
    }
  );

  it("emits the packages/ui defaults when no branding row exists (R-12a)", () => {
    expect(brandingTokens(undefined)).toEqual({
      "--primary": colorRoles.light.primary,
      "--primary-foreground": colorRoles.light["primary-foreground"],
      "font-size": "15px",
      "--font-sans": "var(--font-face-plus-jakarta-sans)",
      "--sign-in-background": "var(--background)",
    });
  });

  it.each([
    [
      "a seed without a color",
      {
        primaryColor: null,
        primaryForeground: null,
        fontSize: "default",
        loginBackgroundColor: null,
      },
    ],
    [
      "a color without its foreground",
      {
        primaryColor: "#0f766e",
        primaryForeground: null,
        fontSize: "default",
        loginBackgroundColor: null,
      },
    ],
    [
      "a value that would close the style element",
      {
        primaryColor: "red;}</style><script>",
        primaryForeground: "#ffffff",
        fontSize: "default",
        loginBackgroundColor: null,
      },
    ],
  ])("falls back to the default pair for %s", (_case, branding) => {
    expect(brandingTokens(branding)).toMatchObject({
      "--primary": "#2563eb",
      "--primary-foreground": "#ffffff",
    });
  });

  it.each(["huge", "constructor", ""])(
    "falls back to the 15 px root for the unknown preset %j",
    (fontSize) => {
      expect(
        brandingTokens({
          primaryColor: null,
          primaryForeground: null,
          fontSize,
          loginBackgroundColor: null,
        })["font-size"]
      ).toBe("15px");
    }
  );
});
