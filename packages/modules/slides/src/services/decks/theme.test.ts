import { describe, expect, it } from "vitest";

import {
  BLUE_THEME,
  DARK_SAMPLE,
  DARK_THEME,
  GREEN_THEME,
  VIOLET_THEME,
} from "../../presentation/__fixtures__/themes.ts";
import { brandTheme, resolveTheme } from "./theme.ts";

const BRANDING = {
  companyName: "Acme",
  primaryColor: "#0f766e",
  primaryForeground: "#ffffff",
  fontFamily: "plus-jakarta-sans",
  logoLightFileId: "7d1e1c1a-0c39-4b8e-9a41-1d6f3f0e9a10",
  logoDarkFileId: null,
};

describe("brandTheme", () => {
  it.each([
    ["keeps the tenant color, in uppercase", {}, { primaryColor: "#0F766E" }],
    [
      "gives the token default for a null color",
      { primaryColor: null },
      { primaryColor: "#2563EB" },
    ],
    [
      "gives the app's default pair for a color that is not hex, as core's primaryPair does",
      { primaryColor: "red" },
      { primaryColor: "#2563EB" },
    ],
    [
      "maps plus-jakarta-sans to its face",
      {},
      { fontFace: "Plus Jakarta Sans" },
    ],
    [
      "maps ibm-plex-sans to its face",
      { fontFamily: "ibm-plex-sans" },
      { fontFace: "IBM Plex Sans" },
    ],
    [
      "maps manrope to its face",
      { fontFamily: "manrope" },
      { fontFace: "Manrope" },
    ],
    [
      "maps source-serif-4 to its face",
      { fontFamily: "source-serif-4" },
      { fontFace: "Source Serif 4" },
    ],
    [
      "maps an unknown key to Arial",
      { fontFamily: "comic-sans" },
      { fontFace: "Arial" },
    ],
    [
      "answers a null logo for a null file id",
      { logoLightFileId: null },
      { logoFileId: null, companyName: "Acme" },
    ],
  ])("%s", (_, change, expected) => {
    expect(brandTheme({ ...BRANDING, ...change })).toMatchObject(expected);
  });
});

/** The brand look of one color, as the fixtures name it. */
const brand = (primaryColor: string, primaryForeground = "#FFFFFF") =>
  brandTheme({
    companyName: "Genie Ops",
    primaryColor,
    primaryForeground,
    fontFamily: "plus-jakarta-sans",
    logoLightFileId: null,
    logoDarkFileId: null,
  });

describe("resolveTheme", () => {
  it.each([
    ["#2563EB", BLUE_THEME],
    ["#047857", GREEN_THEME],
    ["#6D28D9", VIOLET_THEME],
  ])("answers the fixture theme of the %s brand", (color, theme) => {
    expect(resolveTheme(brand(color), undefined)).toEqual(theme);
  });

  it("answers the dark fixture for the dark sample over the blue brand", () => {
    expect(resolveTheme(brand("#2563EB"), DARK_SAMPLE)).toEqual(DARK_THEME);
  });

  it("falls back to the text color for an accent below 3:1 and keeps the brand foreground on the panel", () => {
    expect(resolveTheme(brand("#FACC15", "#111827"), undefined)).toMatchObject({
      accent: "#111827",
      panel: "#FACC15",
      panelText: "#111827",
    });
  });

  it("gives a stored panel without a panel text its readable foreground", () => {
    expect(resolveTheme(brand("#2563EB"), { panel: "#FDE68A" })).toMatchObject({
      panel: "#FDE68A",
      panelText: "#111827",
    });
  });

  it("gives a mid-tone stored panel the text color with more contrast, not white", () => {
    expect(resolveTheme(brand("#2563EB"), { panel: "#60A5FA" })).toMatchObject({
      panelText: "#111827",
    });
  });
});
