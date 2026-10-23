import type { BrandingView } from "../../../services/branding/index.ts";
import type {
  BrandingDraft,
  BrandingImageView,
} from "../../../services/branding/schemas.ts";

/** A one-pixel blue PNG, so a story image loads without a network call. */
export const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=";

export function imageView(
  overrides: Partial<BrandingImageView> = {}
): BrandingImageView {
  return {
    fileId: "7c0e7f3a-3b0b-4d8e-9a43-1f2d3c4b5a69",
    fileName: "northwind-mark.png",
    mimeType: "image/png",
    sizeBytes: 2048,
    scanStatus: "skipped",
    url: PIXEL,
    ...overrides,
  };
}

/** The seeded deployment's branding as the page reads it, with optional draft overrides. */
export function brandingView(
  draft: Partial<BrandingDraft> = {},
  images: BrandingView["images"] = {}
): BrandingView {
  return {
    draft: {
      companyName: "Northwind",
      productName: "Northwind Ops",
      logoLightFileId: null,
      logoDarkFileId: null,
      logoMarkFileId: null,
      faviconFileId: null,
      primaryColor: "#2563eb",
      defaultTheme: "system",
      loginBackgroundColor: null,
      loginWelcomeText: "",
      loginNoticeText: "",
      loginNoticeRequiresAcknowledgement: false,
      ...draft,
    },
    images,
    lastPublished: { by: "Ada Admin", at: "2026-10-20T09:30:00.000Z" },
  };
}
