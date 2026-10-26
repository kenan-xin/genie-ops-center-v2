import { asc, eq, inArray, max, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import { hasWorkspaceEntry } from "../../lib/module-contract/workspace-entry.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { category, tenantModule } from "../../schema.ts";
import { pgErrorCode } from "../../utils/error-cause.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";

/** One row of the Categories page, with the number of placeable modules it holds (R-88). */
export type CategoryRow = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly moduleCount: number;
};

export type CategoryList = {
  readonly categories: readonly CategoryRow[];
  /** Placeable modules under no category, or under one that no longer exists (R-91). */
  readonly ungroupedCount: number;
};

const NAME_MAX = 80;

type Reader = TenantContext["db"] | TenantTransaction;

function validName(raw: string): string {
  const name = raw.trim();

  if (name === "" || name.length > NAME_MAX)
    throw new AppError(CORE_ERRORS["invalid-input"]);

  return name;
}

/**
 * The category of each compiled placeable module, counted per category id. A module whose id names
 * no category row, or that has no `tenant_module` row, counts under `null` (Decision 6, R-91).
 */
async function memberCounts(
  db: Reader,
  compiled: readonly Module[]
): Promise<Map<string | null, number>> {
  const ids = compiled.flatMap((module) =>
    hasWorkspaceEntry(module) ? [module.identity.id] : []
  );

  const rows = await db
    .select({ moduleId: tenantModule.moduleId, categoryId: category.id })
    .from(tenantModule)
    .leftJoin(category, eq(category.id, tenantModule.categoryId))
    .where(inArray(tenantModule.moduleId, ids));

  const byModule = new Map(rows.map((row) => [row.moduleId, row.categoryId]));
  const counts = new Map<string | null, number>();

  for (const id of ids) {
    const key = byModule.get(id) ?? null;

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

async function lockedCategory(tx: TenantTransaction, categoryId: string) {
  const [row] = await tx
    .select({ name: category.name })
    .from(category)
    .where(eq(category.id, categoryId))
    .for("update");

  if (row === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  return row;
}

async function assertNameFree(
  tx: TenantTransaction,
  name: string
): Promise<void> {
  const [taken] = await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.name, name))
    .limit(1);

  if (taken !== undefined)
    throw new AppError(CORE_ERRORS["category-name-taken"]);
}

/** A write that names a category: the unique index's refusal, after a lost race, reads as taken. */
async function naming<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (pgErrorCode(error instanceof Error ? error : undefined) === "23505") {
      throw new AppError(CORE_ERRORS["category-name-taken"], { cause: error });
    }

    throw error;
  }
}

/**
 * The categories in page order with their member counts, read from the database rather than the
 * 10-second cached readers, so the page shows its own write at once (DEC-46).
 */
export async function listCategories(
  tenant: TenantContext,
  compiled: readonly Module[]
): Promise<CategoryList> {
  const rows = await tenant.db
    .select({
      id: category.id,
      name: category.name,
      position: category.position,
    })
    .from(category)
    .orderBy(asc(category.position), asc(category.name));

  const counts = await memberCounts(tenant.db, compiled);

  return {
    categories: rows.map(({ id, name, position }) => ({
      id,
      name,
      position,
      moduleCount: counts.get(id) ?? 0,
    })),
    ungroupedCount: counts.get(null) ?? 0,
  };
}

/** Adds a category at the end of the order (R-87). */
export async function createCategory(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly name: string }
): Promise<string> {
  const name = validName(input.name);

  return naming(() =>
    withTransaction(tenant, async (tx) => {
      await assertNameFree(tx, name);

      const [last] = await tx
        .select({ position: max(category.position) })
        .from(category);

      const [row] = await tx
        .insert(category)
        .values({ name, position: (last?.position ?? -1) + 1 })
        .returning({ id: category.id });

      if (row === undefined)
        throw new Error("the category insert returned no row");

      await writeAdminAuditEvent(tx, {
        action: "core:category_created",
        actorUserId: input.actorUserId,
        targetType: "category",
        targetId: row.id,
        summary: `Created the category ${name}`,
        metadata: { name },
      });

      return row.id;
    })
  );
}

/** Renames a category. The same name again is not a change and writes nothing (R-90). */
export async function renameCategory(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly categoryId: string;
    readonly name: string;
  }
): Promise<void> {
  const name = validName(input.name);

  await naming(() =>
    withTransaction(tenant, async (tx) => {
      const { name: from } = await lockedCategory(tx, input.categoryId);

      if (from === name) return;

      await assertNameFree(tx, name);
      await tx
        .update(category)
        .set({ name, updatedAt: new Date() })
        .where(eq(category.id, input.categoryId));

      await writeAdminAuditEvent(tx, {
        action: "core:category_renamed",
        actorUserId: input.actorUserId,
        targetType: "category",
        targetId: input.categoryId,
        summary: `Renamed the category ${from} to ${name}`,
        metadata: { from, to: name },
      });
    })
  );
}

/**
 * Rewrites `position` as 0..n-1 in the given order (Decision 8). The list must be exactly the
 * current id set, so a stale page cannot drop or invent a category; a page that read the list
 * before another change gets its own code (admin L-2). The same order is not a change.
 */
export async function reorderCategories(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly orderedIds: readonly string[];
  }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    const current = await tx
      .select({ id: category.id })
      .from(category)
      .orderBy(asc(category.position), asc(category.name))
      .for("update");

    const currentIds = current.map((row) => row.id);
    const given = new Set(input.orderedIds);

    if (given.size !== input.orderedIds.length) {
      throw new AppError(CORE_ERRORS["invalid-input"]);
    }

    if (
      given.size !== currentIds.length ||
      currentIds.some((id) => !given.has(id))
    ) {
      throw new AppError(CORE_ERRORS["categories-changed"]);
    }

    if (currentIds.every((id, index) => id === input.orderedIds[index])) return;

    await tx.execute(sql`
      update ${category} set position = o.ord - 1, updated_at = now()
        from unnest(string_to_array(${input.orderedIds.join(",")}, ',')::uuid[])
             with ordinality as o(id, ord)
       where ${category.id} = o.id`);

    await writeAdminAuditEvent(tx, {
      action: "core:category_reordered",
      actorUserId: input.actorUserId,
      targetType: "category",
      summary: "Reordered the categories",
      metadata: { orderedIds: [...input.orderedIds] },
    });
  });
}

/**
 * Deletes the category row only. The foreign key sets its members' `category_id` to null, so they
 * become ungrouped; no module table is touched (R-89).
 */
export async function deleteCategory(
  tenant: TenantContext,
  compiled: readonly Module[],
  input: { readonly actorUserId: string; readonly categoryId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    const { name } = await lockedCategory(tx, input.categoryId);

    const moduleCount =
      (await memberCounts(tx, compiled)).get(input.categoryId) ?? 0;

    await tx.delete(category).where(eq(category.id, input.categoryId));

    await writeAdminAuditEvent(tx, {
      action: "core:category_deleted",
      actorUserId: input.actorUserId,
      targetType: "category",
      targetId: input.categoryId,
      summary: `Deleted the category ${name}`,
      metadata: { name, moduleCount },
    });
  });
}
