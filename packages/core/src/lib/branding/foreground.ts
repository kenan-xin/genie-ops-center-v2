/**
 * The one foreground rule (DEC-47): white or near-black text for a hex background, chosen by
 * relative luminance. Ported from the branding design reference
 * (`docs/design/reference/sections/branding/components/helpers.ts`, `foregroundFor`), so the
 * `seed` step of `genie-ops setup` and the Section 3 branding save compute the same value.
 */

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/** The WCAG relative-luminance constants and the two foreground colours they choose between. */
const FOREGROUND = {
  nearBlack: "#111827",
  white: "#ffffff",
  channelMax: 255,
  linearThreshold: 0.03928,
  linearDivisor: 12.92,
  gammaOffset: 0.055,
  gammaDivisor: 1.055,
  gammaExponent: 2.4,
  redWeight: 0.2126,
  greenWeight: 0.7152,
  blueWeight: 0.0722,
  luminanceThreshold: 0.4,
} as const;

/** One sRGB channel linearized for the relative-luminance sum. */
function channel(component: number): number {
  const ratio = component / FOREGROUND.channelMax;

  return ratio <= FOREGROUND.linearThreshold
    ? ratio / FOREGROUND.linearDivisor
    : ((ratio + FOREGROUND.gammaOffset) / FOREGROUND.gammaDivisor) **
        FOREGROUND.gammaExponent;
}

/** WCAG relative luminance of a six-digit hex colour, or 0 for anything else. */
function luminance(hex: string): number {
  const match = HEX_COLOR.exec(hex.trim());

  if (match === null) return 0;

  const value = Number.parseInt(match[1] ?? "", 16);

  return (
    FOREGROUND.redWeight * channel(value >> 16) +
    FOREGROUND.greenWeight * channel((value >> 8) & FOREGROUND.channelMax) +
    FOREGROUND.blueWeight * channel(value & FOREGROUND.channelMax)
  );
}

/**
 * The foreground for a primary background: near-black above the luminance threshold, white
 * below it. Stored as `primary_foreground` and never recomputed by an email.
 */
export function foregroundFor(hex: string): string {
  return luminance(hex) > FOREGROUND.luminanceThreshold
    ? FOREGROUND.nearBlack
    : FOREGROUND.white;
}
