import { describe, expect, it } from "vitest";

import { primaryPair } from "../../lib/branding/tokens.ts";
import { mailBranding } from "./__fixtures__/branding.ts";
import { mailBrandingTheme } from "./branding.ts";

describe("mailBrandingTheme", () => {
  it("uses the stored pair unchanged", () => {
    const theme = mailBrandingTheme(
      mailBranding({ primaryColor: "#0f766e", primaryForeground: "#fefefe" })
    );

    expect(theme.primaryColor).toBe("#0f766e");
    expect(theme.primaryForeground).toBe("#fefefe");
  });

  it.each([
    {
      case: "a missing foreground",
      primaryColor: "#0f766e",
      primaryForeground: null,
    },
    {
      case: "an invalid color",
      primaryColor: "teal",
      primaryForeground: "#ffffff",
    },
  ])("falls back to the default pair for $case", (row) => {
    const theme = mailBrandingTheme(mailBranding(row));

    const fallback = primaryPair(undefined);

    expect([theme.primaryColor, theme.primaryForeground]).toEqual([
      fallback.primary,
      fallback.foreground,
    ]);
  });

  it("keeps empty and null optional values null", () => {
    const theme = mailBrandingTheme(
      mailBranding({ emailFooterText: "  ", supportEmail: "", termsUrl: null })
    );

    expect([
      theme.footerText,
      theme.supportEmail,
      theme.supportUrl,
      theme.termsUrl,
    ]).toEqual([null, null, null, null]);
  });
});
