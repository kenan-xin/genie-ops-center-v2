/** The tenant branding a deck draws with, on screen and in PowerPoint (R-55, D9). */
export type DeckTheme = {
  readonly companyName: string;
  readonly primaryColor: string;
  readonly fontFace: string;
  readonly logoFileId: string | null;
};

/** The primary token's default, for a tenant that set no color. */
export const DEFAULT_PRIMARY = "#2563eb";

/** The face name of each font key the branding seed accepts (ruling F13). */
const FONT_FACES = new Map([
  ["plus-jakarta-sans", "Plus Jakarta Sans"],
  ["ibm-plex-sans", "IBM Plex Sans"],
  ["manrope", "Manrope"],
  ["source-serif-4", "Source Serif 4"],
]);

/** Core does not export its branding row type, so the input names the four fields it reads. */
export function deckTheme(branding: {
  readonly companyName: string;
  readonly primaryColor: string | null;
  readonly fontFamily: string;
  readonly logoLightFileId: string | null;
}): DeckTheme {
  return {
    companyName: branding.companyName,
    primaryColor: branding.primaryColor ?? DEFAULT_PRIMARY,
    // PowerPoint has Arial everywhere, so an unknown key still draws.
    fontFace: FONT_FACES.get(branding.fontFamily) ?? "Arial",
    logoFileId: branding.logoLightFileId,
  };
}
