import { z } from "zod";

import {
  BRANDING_TEXT_LIMITS,
  brandingFileId,
  brandingPrimaryColor,
  brandingSignInBackground,
  brandingText,
} from "../../lib/branding/fields.ts";

export {
  BRANDING_CONTRAST_REFUSAL,
  HEX_COLOR,
} from "../../lib/branding/fields.ts";

/**
 * The Branding draft (R-43 to R-49). It imports only zod and the pure contrast rule, so the screen
 * validates with it in the browser and `applyBranding` parses with it on the server: one rule, one
 * text.
 */
export const BRANDING_IMAGE_SLOTS = [
  "logoLight",
  "logoDark",
  "logoMark",
  "favicon",
] as const;

export type BrandingImageSlot = (typeof BRANDING_IMAGE_SLOTS)[number];

/** The branding cap (R-49). The file service limit, `FILE_MAX_BYTES`, is far larger. */
export const BRANDING_IMAGE_MAX_BYTES = 1_048_576;

/** PNG, SVG, WebP and ICO under both of its declared types (R-49). */
export const BRANDING_IMAGE_TYPES: readonly string[] = Object.freeze([
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/** The type an extension names, for a file whose declared type is empty (DR-20 S3-07). */
const BRANDING_IMAGE_TYPE_BY_EXTENSION: Readonly<Record<string, string>> =
  Object.freeze({
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  });

export const BRANDING_UPLOAD_TOO_LARGE = "This file is over 1 MB.";

export const BRANDING_UPLOAD_WRONG_TYPE = "Use a PNG, SVG, WebP or ICO file.";

/** The deployment's `FILE_MAX_BYTES` is below 1 MB and the file is over it. */
export const BRANDING_UPLOAD_OVER_LIMIT =
  "This file is over the upload limit of this deployment.";

export const BRANDING_UPLOAD_BAD_SVG =
  "This SVG cannot be used. Save it as UTF-8 with at least one shape and no script.";

/**
 * The type of a branding file: its declared type, or when that is empty the type its extension
 * names. Another extension answers an empty string, which the type list refuses.
 */
export function brandingImageType(file: {
  readonly name: string;
  readonly type: string;
}): string {
  const declared = file.type.trim().toLowerCase();

  if (declared !== "") return declared;

  const fileName = file.name.toLowerCase();

  return (
    BRANDING_IMAGE_TYPE_BY_EXTENSION[
      fileName.slice(fileName.lastIndexOf("."))
    ] ?? ""
  );
}

export type ScanStatus = "pending" | "clean" | "infected" | "skipped";

/** One branding image as the page shows it. `url` is null unless the scan is clean or skipped. */
export type BrandingImageView = {
  readonly fileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly scanStatus: ScanStatus;
  readonly url: string | null;
};

function optionalText(max: number) {
  return brandingText(max)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));
}

const fileId = brandingFileId.nullable();

export const brandingDraftSchema = z
  .object({
    companyName: brandingText(BRANDING_TEXT_LIMITS.companyName).min(1, {
      error: "Enter a company name.",
    }),
    productName: brandingText(BRANDING_TEXT_LIMITS.productName).min(1, {
      error: "Enter a product name.",
    }),
    logoLightFileId: fileId,
    logoDarkFileId: fileId,
    logoMarkFileId: fileId,
    faviconFileId: fileId,
    primaryColor: brandingPrimaryColor,
    defaultTheme: z.enum(["light", "dark", "system"]),
    loginBackgroundColor: brandingSignInBackground.nullable(),
    loginWelcomeText: optionalText(BRANDING_TEXT_LIMITS.loginWelcomeText),
    loginNoticeText: optionalText(BRANDING_TEXT_LIMITS.loginNoticeText),
    loginNoticeRequiresAcknowledgement: z.boolean(),
  })
  .refine(
    (draft) =>
      !draft.loginNoticeRequiresAcknowledgement ||
      draft.loginNoticeText !== null,
    {
      error: "Add a notice first.",
      path: ["loginNoticeRequiresAcknowledgement"],
    }
  );

export type BrandingDraft = z.input<typeof brandingDraftSchema>;

/** The draft fields in schema order: the order of the audit metadata and the change lists. */
// SAFETY: the keys of the schema's own shape are exactly the draft fields.
export const BRANDING_FIELDS = Object.keys(
  brandingDraftSchema.shape
) as (keyof BrandingDraft)[];

export type ParsedBrandingDraft = z.output<typeof brandingDraftSchema>;
