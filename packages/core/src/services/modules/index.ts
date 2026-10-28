import { eq, inArray } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { PermissionKey } from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import { hasWorkspaceEntry } from "../../lib/module-contract/workspace-entry.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { category, tenantModule } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";
import { type PermissionHolder, readHolders } from "../authorization/index.ts";
import {
  compiledModule,
  type ModuleEnableResult,
  ModuleManagementError,
  setModuleEnabledIn,
} from "../module-management/index.ts";

/** A principal that holds `<id>:use` through one role (R-86). */
export type ModuleHolder = PermissionHolder;

/** One row of the Modules page: a compiled module, its state, its category and its holders. */
export type ModuleRow = {
  readonly id: string;
  readonly displayName: string;
  /** The module's one-line description, or null when it declares none. */
  readonly description: string | null;
  readonly enabled: boolean;
  /** Null when the row names no category, or a category that no longer exists (R-91). */
  readonly categoryId: string | null;
  /** Whether the module declares a workspace entry, so a category can place it (Decision 6). */
  readonly placeable: boolean;
  readonly holders: readonly ModuleHolder[];
};

/**
 * The compiled modules in image order, read from the database rather than the 10-second cached
 * readers, so the page shows its own write at once (DEC-46). A `tenant_module` row of a module the
 * image does not carry never appears. A compiled module with no row reads as off.
 */
export async function listModules(
  tenant: TenantContext,
  compiled: readonly Module[]
): Promise<readonly ModuleRow[]> {
  const ids = compiled.map((module) => module.identity.id);

  const rows = await tenant.db
    .select({
      moduleId: tenantModule.moduleId,
      enabled: tenantModule.enabled,
      // The join, not the stored column, so a dangling id reads as no category (R-91).
      categoryId: category.id,
    })
    .from(tenantModule)
    .leftJoin(category, eq(category.id, tenantModule.categoryId))
    .where(inArray(tenantModule.moduleId, ids));

  const holders = await readHolders(
    tenant,
    compiled,
    ids.map((id): PermissionKey => `${id}:use`)
  );

  const byId = new Map(rows.map((row) => [row.moduleId, row]));

  return compiled.map((module) => {
    const id = module.identity.id;
    const row = byId.get(id);

    return {
      id,
      displayName: module.identity.displayName,
      description: module.identity.description ?? null,
      enabled: row?.enabled ?? false,
      categoryId: row?.categoryId ?? null,
      placeable: hasWorkspaceEntry(module),
      holders: holders.get(`${id}:use`) ?? [],
    };
  });
}

/**
 * The Modules page switch (R-82, R-90a). It calls the one shared procedure and writes its `core:`
 * audit row in the same transaction, and only when the call changed the row (R-90).
 */
export async function switchModule(
  tenant: TenantContext,
  compiled: readonly Module[],
  input: {
    readonly actorUserId: string;
    readonly moduleId: string;
    readonly enabled: boolean;
  }
): Promise<ModuleEnableResult> {
  return withTransaction(tenant, async (tx) => {
    const result = await setModuleEnabledIn(
      tx,
      compiled,
      input.moduleId,
      input.enabled
    );

    if (result.changed) {
      const { displayName } = compiledModule(compiled, input.moduleId).identity;

      await writeAdminAuditEvent(tx, {
        action: input.enabled ? "core:module_enabled" : "core:module_disabled",
        actorUserId: input.actorUserId,
        targetType: "module",
        targetId: input.moduleId,
        summary: `${input.enabled ? "Switched on" : "Switched off"} ${displayName}`,
      });
    }

    return result;
  });
}

/**
 * Places a module under a category, or under none (R-91a). Only a module with a workspace entry has
 * a place; a disabled one can still be placed. The same category again is not a change and writes
 * nothing (R-90), so the answer says whether the row changed.
 */
export async function setModuleCategory(
  tenant: TenantContext,
  compiled: readonly Module[],
  input: {
    readonly actorUserId: string;
    readonly moduleId: string;
    readonly categoryId: string | null;
  }
): Promise<{ readonly changed: boolean }> {
  const module = compiledModule(compiled, input.moduleId);

  if (!hasWorkspaceEntry(module))
    throw new AppError(CORE_ERRORS["invalid-input"]);

  return withTransaction(tenant, async (tx) => {
    let categoryName: string | undefined;

    if (input.categoryId !== null) {
      // Shared, so a concurrent delete waits for this write or ran first and reads as not-found.
      const [found] = await tx
        .select({ name: category.name })
        .from(category)
        .where(eq(category.id, input.categoryId))
        .for("share");

      if (found === undefined) throw new AppError(CORE_ERRORS["not-found"]);

      categoryName = found.name;
    }

    const [row] = await tx
      .select({ categoryId: tenantModule.categoryId })
      .from(tenantModule)
      .where(eq(tenantModule.moduleId, input.moduleId))
      .for("update");

    if (row === undefined) {
      throw new ModuleManagementError(
        "module-not-registered",
        `module-not-registered: ${input.moduleId} has no tenant_module row`
      );
    }

    if (row.categoryId === input.categoryId) return { changed: false };

    await tx
      .update(tenantModule)
      .set({ categoryId: input.categoryId })
      .where(eq(tenantModule.moduleId, input.moduleId));

    const { displayName } = module.identity;

    await writeAdminAuditEvent(tx, {
      action: "core:module_category_set",
      actorUserId: input.actorUserId,
      targetType: "module",
      targetId: input.moduleId,
      summary:
        categoryName === undefined
          ? `Removed ${displayName} from its category`
          : `Placed ${displayName} in ${categoryName}`,
      metadata: {
        categoryId: input.categoryId,
        previousCategoryId: row.categoryId,
      },
    });

    return { changed: true };
  });
}
