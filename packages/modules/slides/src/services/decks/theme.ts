import { contrastRatio, primaryPair } from "@genie/core";

import {
  type SlideTheme,
  type StoredTheme,
  THEME_BACKGROUND,
  THEME_TEXT,
} from "../../contract.ts";
import { readableOn } from "../../presentation/slide-layout.ts";

/** The tenant branding a deck draws with, on screen and in PowerPoint (R-55, D9). */
export type BrandTheme = {
  readonly companyName: string;
  readonly primaryColor: string;
  readonly primaryForeground: string;
  readonly fontFace: string;
  readonly logoFileId: string | null;
  readonly logoDarkFileId: string | null;
};

/** The face name of each font key the branding seed accepts (ruling F13). */
const FONT_FACES = new Map([
  ["plus-jakarta-sans", "Plus Jakarta Sans"],
  ["ibm-plex-sans", "IBM Plex Sans"],
  ["manrope", "Manrope"],
  ["source-serif-4", "Source Serif 4"],
]);

/** Core does not export its branding row type, so the input names the six fields it reads. */
export function brandTheme(branding: {
  readonly companyName: string;
  readonly primaryColor: string | null;
  readonly primaryForeground: string | null;
  readonly fontFamily: string;
  readonly logoLightFileId: string | null;
  readonly logoDarkFileId: string | null;
}): BrandTheme {
  // Core's one rule: the stored pair only when both are valid hex, so the deck matches the app.
  const pair = primaryPair(branding);

  return {
    companyName: branding.companyName,
    // Uppercase, as `mixHex` answers, so every theme color compares as one string.
    primaryColor: pair.primary.toUpperCase(),
    primaryForeground: pair.foreground.toUpperCase(),
    // PowerPoint has Arial everywhere, so an unknown key still draws.
    fontFace: FONT_FACES.get(branding.fontFamily) ?? "Arial",
    logoFileId: branding.logoLightFileId,
    logoDarkFileId: branding.logoDarkFileId,
  };
}

const channels = (hex: string) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** `amount` of `foreground` over `background`, as uppercase `#RRGGBB`. */
function mixHex(foreground: string, background: string, amount: number) {
  const back = channels(background);

  return `#${channels(foreground)
    .map((value, index) =>
      Math.round(value * amount + (back[index] ?? 0) * (1 - amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`;
}

/** The theme a deck draws with: its stored keys over the brand look (P14-5, P14-6). */
export function resolveTheme(
  brand: BrandTheme,
  stored: StoredTheme | undefined
): SlideTheme {
  const own = stored ?? {};
  const background = own.background ?? THEME_BACKGROUND;
  const text = own.text ?? THEME_TEXT;
  const secondaryText = own.secondaryText ?? "#4B5563";
  const layout = own.layout ?? "solid";
  const rule = mixHex(text, background, 0.25);
  const panel = own.panel ?? (layout === "solid" ? brand.primaryColor : rule);

  const panelText =
    layout === "light"
      ? text
      : (own.panelText ??
        (own.panel === undefined
          ? brand.primaryForeground
          : readableOn(panel)));

  const accent =
    own.accent ??
    (contrastRatio(brand.primaryColor, background) >= 3
      ? brand.primaryColor
      : text);

  return {
    companyName: brand.companyName,
    fontFace: brand.fontFace,
    background,
    text,
    secondaryText,
    accent,
    accentText: readableOn(accent),
    panel,
    panelText,
    panelBody: layout === "light" ? secondaryText : panelText,
    hairline: mixHex(text, background, 0.12),
    rule,
    neutral: mixHex(text, background, 0.5),
    ring: layout === "solid" ? mixHex(panelText, panel, 0.22) : accent,
    layout,
    weight: own.weight ?? "bold",
    logo: own.logo ?? "light",
    dark: readableOn(background) === "#FFFFFF",
  };
}
