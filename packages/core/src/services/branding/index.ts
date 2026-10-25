import { colorRoles } from "@genie/ui/tokens";
import { eq, inArray, sql } from "drizzle-orm";
import { isEqual } from "es-toolkit";
import { z } from "zod";

import { foregroundFor } from "../../lib/branding/foreground.ts";
import {
  AppError,
  type AppErrorIssue,
  CORE_ERRORS,
} from "../../lib/errors/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { file, tenantBranding, user } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import {
  BRANDING_FIELDS,
  BRANDING_IMAGE_SLOTS,
  BRANDING_IMAGE_TYPES,
  type BrandingDraft,
  type BrandingImageSlot,
  brandingDraftSchema,
  type ParsedBrandingDraft,
} from "./schemas.ts";
import { type BrandingImageView, brandingImageView } from "./upload.ts";

export type { BrandingImageView } from "./schemas.ts";

/** Who published last, and when. `by` is null for the provisioning seed. */
export type BrandingView = {
  readonly draft: BrandingDraft;
  readonly images: Partial<Record<BrandingImageSlot, BrandingImageView>>;
  readonly lastPublished: { readonly by: string | null; readonly at: string };
};

type BrandingField = keyof ParsedBrandingDraft;

const SLOT_FIELD = {
  logoLight: "logoLightFileId",
  logoDark: "logoDarkFileId",
  logoMark: "logoMarkFileId",
  favicon: "faviconFileId",
} as const satisfies Record<BrandingImageSlot, BrandingField>;

/** The one fixed refusal for a slot whose stored id has no `file` row, naming it in words. */
const MISSING_IMAGE_MESSAGE = {
  logoLight:
    "The logo for light backgrounds is missing. Remove it or upload it again.",
  logoDark:
    "The logo for dark backgrounds is missing. Remove it or upload it again.",
  logoMark: "The square mark is missing. Remove it or upload it again.",
  favicon: "The favicon is missing. Remove it or upload it again.",
} as const satisfies Record<BrandingImageSlot, string>;

type BrandingRow = typeof tenantBranding.$inferSelect;

/** The row as the page edits it: no null name, the default color, empty texts for absent ones. */
function draftOf(row: BrandingRow): BrandingDraft {
  return {
    companyName: row.companyName,
    productName: row.productName,
    logoLightFileId: row.logoLightFileId,
    logoDarkFileId: row.logoDarkFileId,
    logoMarkFileId: row.logoMarkFileId,
    faviconFileId: row.faviconFileId,
    primaryColor: row.primaryColor ?? colorRoles.light.primary,
    defaultTheme:
      row.defaultTheme === "light" || row.defaultTheme === "dark"
        ? row.defaultTheme
        : "system",
    loginBackgroundColor: row.loginBackgroundColor,
    loginWelcomeText: row.loginWelcomeText ?? "",
    loginNoticeText: row.loginNoticeText ?? "",
    loginNoticeRequiresAcknowledgement: row.loginNoticeRequiresAcknowledgement,
  };
}

function invalid(issues: readonly AppErrorIssue[]): never {
  throw new AppError(CORE_ERRORS["branding-invalid"], { issues });
}

/**
 * The Branding page read (R-43). It reads the row fresh from the database, never the 10-second
 * branding reader, so a Publish shows at once (DEC-46), and it issues one preview link per image
 * on every read (D3-7).
 */
export async function readBranding(
  tenant: TenantContext,
  caller: RequestPrincipal
): Promise<BrandingView> {
  const [found] = await tenant.db
    .select({ row: tenantBranding, by: user.name })
    .from(tenantBranding)
    .leftJoin(user, eq(user.id, tenantBranding.updatedByUserId));

  if (found === undefined) throw new Error("tenant_branding holds no row");

  const draft = draftOf(found.row);

  const entries = await Promise.all(
    BRANDING_IMAGE_SLOTS.map(async (slot) => {
      const fileId = draft[SLOT_FIELD[slot]];

      const view =
        fileId === null
          ? null
          : await brandingImageView(tenant, caller, fileId);

      return view === null ? [] : [[slot, view] as const];
    })
  );

  return {
    draft,
    images: Object.fromEntries(entries.flat()),
    lastPublished: { by: found.by, at: found.row.updatedAt.toISOString() },
  };
}

/** Refuses an image id that names no `file` row of a branding type (Decision 6, R-49). */
async function refuseForeignImages(
  tx: TenantTransaction,
  draft: ParsedBrandingDraft
): Promise<void> {
  const named = BRANDING_IMAGE_SLOTS.flatMap((slot) => {
    const id = draft[SLOT_FIELD[slot]];

    return id === null ? [] : [{ slot, field: SLOT_FIELD[slot], id }];
  });

  if (named.length === 0) return;

  const rows = await tx
    .select({ id: file.id, mimeType: file.mimeType })
    .from(file)
    .where(
      inArray(
        file.id,
        named.map((image) => image.id)
      )
    );

  const found = new Set(rows.map((row) => row.id));

  const images = new Set(
    rows
      .filter((row) => BRANDING_IMAGE_TYPES.includes(row.mimeType))
      .map((row) => row.id)
  );

  const issues = named
    .filter((image) => !images.has(image.id))
    .map((image) => ({
      path: image.field,
      // A row of the wrong type is not missing; a dead id names the slot that lost it.
      message: found.has(image.id)
        ? "Upload the image again."
        : MISSING_IMAGE_MESSAGE[image.slot],
    }));

  if (issues.length > 0) invalid(issues);
}

/**
 * The one writer of `tenant_branding` after setup (R-44, R-45, DEC-47). The draft holds the fields
 * to change; each is laid over the locked row, so a concurrent Publish of another field is kept.
 * The whole result is parsed with the page's schema, the foreground is computed and stored, and
 * one `core:branding_published` row names the changed fields, all in one transaction. It writes
 * the branding row only: no Keycloak call, no realm data. A Publish that changes nothing writes
 * nothing.
 */
export async function applyBranding(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly draft: unknown }
): Promise<{
  readonly changed: boolean;
  readonly changedFields: readonly string[];
}> {
  const sent = z.record(z.string(), z.unknown()).safeParse(input.draft);

  if (!sent.success) invalid([]);

  return withTransaction(tenant, async (tx) => {
    const [row] = await tx.select().from(tenantBranding).for("update");

    if (row === undefined) throw new Error("tenant_branding holds no row");

    const stored = draftOf(row);
    const parsed = brandingDraftSchema.safeParse({ ...stored, ...sent.data });

    if (!parsed.success)
      invalid(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );

    await refuseForeignImages(tx, parsed.data);

    // The stored values as the schema outputs them, without re-checking them: a seeded color that
    // fails today's rule still compares, and the parse above already refused it for this Publish.
    const current: ParsedBrandingDraft = {
      ...stored,
      loginWelcomeText: row.loginWelcomeText,
      loginNoticeText: row.loginNoticeText,
    };

    const changedFields = BRANDING_FIELDS.filter(
      (field) => !isEqual(parsed.data[field], current[field])
    );

    if (changedFields.length === 0)
      return { changed: false, changedFields: [] };

    const changes = Object.fromEntries(
      changedFields.map((field) => [field, parsed.data[field]])
    );

    await tx.update(tenantBranding).set({
      ...changes,
      primaryForeground: foregroundFor(parsed.data.primaryColor),
      updatedByUserId: input.actorUserId,
      updatedAt: sql`now()`,
    });

    // Only the field names: the values are on the row, and an image id says nothing (R-90a).
    await writeAdminAuditEvent(tx, {
      action: "core:branding_published",
      actorUserId: input.actorUserId,
      targetType: "branding",
      targetId: "tenant",
      summary: `Published ${changedFields.length} branding ${changedFields.length === 1 ? "change" : "changes"}`,
      metadata: { changedFields },
    });

    return { changed: true, changedFields };
  });
}
