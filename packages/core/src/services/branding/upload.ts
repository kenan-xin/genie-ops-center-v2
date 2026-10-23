import { eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { file } from "../../schema.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { normalizeMimeType } from "../file-storage/index.ts";
import {
  BRANDING_IMAGE_MAX_BYTES,
  BRANDING_IMAGE_TYPES,
  BRANDING_UPLOAD_TOO_LARGE,
  BRANDING_UPLOAD_WRONG_TYPE,
  type BrandingImageView,
  type ScanStatus,
} from "./schemas.ts";

export type { BrandingImageView } from "./schemas.ts";

const BRANDING_PERMISSION = "core:branding:manage";

function isScanStatus(value: string): value is ScanStatus {
  return ["pending", "clean", "infected", "skipped"].includes(value);
}

/**
 * A stored file as a branding image, with a record link issued for this read (D3-7). The link is
 * gated by `can()` on the branding key, so only a branding administrator may open it.
 */
export async function brandingImageView(
  tenant: TenantContext,
  caller: RequestPrincipal,
  fileId: string
): Promise<BrandingImageView | null> {
  const [row] = await tenant.db
    .select({
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      scanStatus: file.scanStatus,
    })
    .from(file)
    .where(eq(file.id, fileId));

  if (row === undefined) return null;

  const scanStatus = isScanStatus(row.scanStatus) ? row.scanStatus : "pending";
  const shown = scanStatus === "clean" || scanStatus === "skipped";

  const link = shown
    ? await tenant.fileStorage.createLink({
        fileId,
        principal: caller,
        permission: BRANDING_PERMISSION,
        resource: { type: "file", id: fileId },
      })
    : undefined;

  return {
    fileId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    scanStatus,
    url: link?.url ?? null,
  };
}

function refuse(message: string): never {
  throw new AppError(CORE_ERRORS["branding-upload-refused"], {
    issues: [{ path: "file", message }],
  });
}

/**
 * The branding upload seam (R-49, DEC-20). The cap and the four types are checked before the file
 * store, so a refused file never reaches the adapter. The store then sanitizes an SVG and writes
 * the row and the bytes in one transaction. It writes no branding column: Publish does (R-44).
 */
export async function uploadBrandingImage(
  tenant: TenantContext,
  caller: RequestPrincipal,
  input: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly bytes: Buffer;
  }
): Promise<BrandingImageView> {
  if (input.bytes.length > BRANDING_IMAGE_MAX_BYTES)
    refuse(BRANDING_UPLOAD_TOO_LARGE);

  if (!BRANDING_IMAGE_TYPES.includes(normalizeMimeType(input.mimeType)))
    refuse(BRANDING_UPLOAD_WRONG_TYPE);

  const stored = await withTransaction(tenant, (tx) =>
    tenant.fileStorage.store({ ...input, uploadedByUserId: caller.userId }, tx)
  );

  const view = await brandingImageView(tenant, caller, stored.id);

  if (view === null) throw new Error(`the stored file ${stored.id} has no row`);

  return view;
}
