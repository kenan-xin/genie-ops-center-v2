import {
  colorRoles,
  defaultFont,
  defaultFontSizePreset,
  fontSizePresetsPx,
} from "@genie/ui/tokens";

export type BrandingTokenSource = {
  readonly primaryColor: string | null;
  readonly primaryForeground: string | null;
  readonly fontSize: string;
};

export type BrandingTokens = {
  readonly "--primary": string;
  readonly "--primary-foreground": string;
  readonly "font-size": string;
  readonly "--font-sans": string;
};

// The seed schema's own rule. A value that passes holds no character that can close a style element.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isHex(value: string | null): value is string {
  return value !== null && HEX_COLOR.test(value);
}

/**
 * The per-request branding layer (R-12 to R-14): the declarations the root layout writes on
 * `:root`. The stored pair is emitted only when both values are valid, so a pair is never mixed
 * and a foreground whose contrast no save tested never renders (R-12a, R-13). The face stays the
 * default until the Typography tab reopens, so `font_family` is never read (R-14).
 */
export function brandingTokens(
  branding: BrandingTokenSource | undefined
): BrandingTokens {
  const pair =
    branding !== undefined &&
    isHex(branding.primaryColor) &&
    isHex(branding.primaryForeground)
      ? {
          primary: branding.primaryColor,
          foreground: branding.primaryForeground,
        }
      : {
          primary: colorRoles.light.primary,
          foreground: colorRoles.light["primary-foreground"],
        };

  // SAFETY: the assertion runs only after Object.hasOwn proved the key is a preset name.
  const preset =
    branding !== undefined &&
    Object.hasOwn(fontSizePresetsPx, branding.fontSize)
      ? (branding.fontSize as keyof typeof fontSizePresetsPx)
      : defaultFontSizePreset;

  return {
    "--primary": pair.primary,
    "--primary-foreground": pair.foreground,
    "font-size": `${fontSizePresetsPx[preset]}px`,
    "--font-sans": `var(--font-face-${defaultFont})`,
  };
}
