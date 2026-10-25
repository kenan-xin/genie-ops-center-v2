import { z } from "zod";

import { brandingContrastPasses } from "../../lib/branding/contrast-pairs.ts";

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

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const HEX_MESSAGE = "Enter a six-digit hex color, for example #2563eb.";

const LENGTH_MESSAGE = "Keep it to 80 characters.";

function name(required: string) {
  return z
    .string()
    .trim()
    .min(1, { error: required })
    .max(80, { error: LENGTH_MESSAGE });
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Keep it to ${max} characters.` })
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));
}

const hex = z.string().trim().regex(HEX_COLOR, { error: HEX_MESSAGE });

const fileId = z.uuid().nullable();

export const brandingDraftSchema = z
  .object({
    companyName: name("Enter a company name."),
    productName: name("Enter a product name."),
    logoLightFileId: fileId,
    logoDarkFileId: fileId,
    logoMarkFileId: fileId,
    faviconFileId: fileId,
    primaryColor: hex.refine(brandingContrastPasses, {
      error: "Fix the failing contrast checks first.",
    }),
    defaultTheme: z.enum(["light", "dark", "system"]),
    loginBackgroundColor: hex.nullable(),
    loginWelcomeText: optionalText(120),
    loginNoticeText: optionalText(1000),
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
