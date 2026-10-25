import { z } from "zod";

import {
  brandingContrastPairs,
  contrastAllowsPublish,
  signInContrastPairs,
} from "./contrast-pairs.ts";

/**
 * The field rules of the Branding page (R-43 to R-49) that the branding seed also applies (U-7), so
 * setup never stores a value that a later Publish would refuse or change.
 */
export const BRANDING_TEXT_LIMITS = {
  companyName: 80,
  productName: 80,
  loginWelcomeText: 120,
  loginNoticeText: 1000,
} as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const HEX_MESSAGE = "Enter a six-digit hex color, for example #2563eb.";

/** A color that puts an R-46 pair below 3:1. The screen's Publish gate names the same text. */
export const BRANDING_CONTRAST_REFUSAL =
  "Fix the failing contrast checks first.";

/** Trimmed text up to `max` characters. */
export function brandingText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Keep it to ${max} characters.` });
}

// An invalid hex stops here, so it gets one message and no contrast check sees it.
export const brandingHex = z
  .string()
  .trim()
  .regex(HEX_COLOR, { error: HEX_MESSAGE, abort: true });

export const brandingPrimaryColor = brandingHex.refine(
  (color) => contrastAllowsPublish(brandingContrastPairs(color)),
  { error: BRANDING_CONTRAST_REFUSAL }
);

export const brandingSignInBackground = brandingHex.refine(
  (color) => contrastAllowsPublish(signInContrastPairs(color)),
  { error: BRANDING_CONTRAST_REFUSAL }
);

/** A stored branding image is a `file` row, named by its UUID. */
export const brandingFileId = z.uuid();
