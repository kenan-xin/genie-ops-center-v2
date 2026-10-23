import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import { brandingContract } from "./contract.ts";
import { applyBranding, readBranding } from "./index.ts";
import { uploadBrandingImage } from "./upload.ts";

// The session check, then the permission gate, both before input is parsed, as in the Settings
// router: a caller without the key answers `forbidden` at 403 whatever the body holds.
const os = implementCoreArea(brandingContract);

const managed = os.use(async ({ context, next }) => {
  if (!(await can(context.caller, "core:branding:manage"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return next();
});

/**
 * The Branding page router, behind `core:branding:manage` through the one `can()` seam (R-95).
 * Refusals propagate untranslated.
 */
export function createBrandingRouter() {
  return os.router({
    read: managed.read.handler(({ context }) =>
      readBranding(context.tenant, context.caller)
    ),

    publish: managed.publish.handler(({ context, input }) =>
      applyBranding(context.tenant, {
        actorUserId: context.caller.userId,
        draft: input.draft,
      })
    ),

    upload: managed.upload.handler(async ({ context, input }) =>
      uploadBrandingImage(context.tenant, context.caller, {
        fileName: input.file.name,
        mimeType: input.file.type,
        bytes: Buffer.from(await input.file.arrayBuffer()),
      })
    ),
  });
}

export type BrandingRouter = ReturnType<typeof createBrandingRouter>;
