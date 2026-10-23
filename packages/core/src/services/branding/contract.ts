import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { BrandingImageView, BrandingView } from "./index.ts";
import { BRANDING_IMAGE_SLOTS } from "./schemas.ts";

/**
 * The Branding page API (R-43 to R-49), under core's `/branding/` area. The publish input checks
 * shape only; the service parses the draft with the page's schema, so a refusal carries
 * `branding-invalid` with its issues. An upload is one multipart request with one file. Answers
 * are typed from the service with `z.custom`.
 */
export const brandingContract = {
  read: oc
    .route({ method: "GET", path: "/branding" })
    .output(z.custom<BrandingView>()),

  publish: oc
    .route({ method: "PUT", path: "/branding" })
    .input(z.object({ draft: z.record(z.string(), z.unknown()) }))
    .output(
      z.custom<{
        readonly changed: boolean;
        readonly changedFields: readonly string[];
      }>()
    ),

  upload: oc
    .route({ method: "POST", path: "/branding/images" })
    .input(z.object({ slot: z.enum(BRANDING_IMAGE_SLOTS), file: z.file() }))
    .output(z.custom<BrandingImageView>()),
};

export type BrandingContract = typeof brandingContract;
