import { describe, expect, it } from "vitest";

import { deckTheme } from "./theme.ts";

const BRANDING = {
  companyName: "Acme",
  primaryColor: "#0f766e",
  fontFamily: "plus-jakarta-sans",
  logoLightFileId: "7d1e1c1a-0c39-4b8e-9a41-1d6f3f0e9a10",
};

describe("deckTheme", () => {
  it.each([
    ["keeps the tenant color", {}, { primaryColor: "#0f766e" }],
    [
      "gives the token default for a null color",
      { primaryColor: null },
      { primaryColor: "#2563eb" },
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
    expect(deckTheme({ ...BRANDING, ...change })).toMatchObject(expected);
  });
});
