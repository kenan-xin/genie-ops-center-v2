import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  category,
  tenantBranding,
  tenantModule,
  tenantSettings,
} from "../../schema.ts";
import { READER_WINDOW_MS } from "./reader-window.ts";

/**
 * The four changing tenant readers: settings over `tenant_settings`, branding over
 * `tenant_branding`, entitlements over `tenant_module`, and categories over `category` plus each
 * module's placement on `tenant_module` (DEC-46, amended for DEC-51). This module is the only place in
 * core that reads those tables (R-7); the migrator run, the `seed` step and the enable
 * procedure write them, and every other caller reads through a context that this file built.
 * The Tenant Settings service (`services/settings/`) also writes `tenant_settings` and
 * `tenant_module.config`, and its page reads them fresh. The Branding service
 * (`services/branding/`) writes `tenant_branding` through `applyBranding` and its page reads the
 * row fresh too.
 *
 * A save reaches every app copy through the database (DEC-58): a statement trigger on each of the
 * four tables sends `pg_notify` on `TENANT_CACHE_CHANNEL` when its transaction commits, and the
 * context's listener calls `clearAll`. The ten-second expiry stays as the fallback for a lost
 * notification.
 */

/** The channel the four tables' triggers notify on commit (migration 0015, DEC-58). */
export const TENANT_CACHE_CHANNEL = "genie_tenant_cache";

/** The Drizzle client every reader reads through. The pool and its `$client` stay on the context. */
type TenantDatabase = NodePgDatabase<Record<string, never>>;

/** The row the settings reader serves, exactly the shape `tenant_settings` selects. */
export type TenantSettings = typeof tenantSettings.$inferSelect;

/** The row the branding reader serves, exactly the shape `tenant_branding` selects. */
export type TenantBranding = typeof tenantBranding.$inferSelect;

export type SettingsReader = {
  readonly get: () => Promise<TenantSettings>;
};

export type BrandingReader = {
  readonly get: () => Promise<TenantBranding>;
};

/**
 * Entitlement is a separate gate from authorization (DEC-39): this answers whether the deployment
 * switched the module on, and never whether a caller may use it. It answers only for the modules
 * the image compiled (R-79): a compiled module with no `tenant_module` row reads as disabled
 * (R-5), and an id the image did not compile is disabled without reading the table, so a retained
 * row grants nothing after a removal.
 */
export type EntitlementReader = {
  readonly isEnabled: (moduleId: string) => Promise<boolean>;
};

/** One `category` row as the navigation tree reads it (DEC-51). */
export type NavigationCategory = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
};

export type CategoryReader = {
  /** Every category row, ordered by `position`, then `name`. */
  readonly list: () => Promise<readonly NavigationCategory[]>;
  /** A compiled module's category id, or null: no row, no category, or an id the image did not compile. */
  readonly ofModule: (moduleId: string) => Promise<string | null>;
};

export type TenantReaders = {
  readonly settings: SettingsReader;
  readonly branding: BrandingReader;
  readonly entitlements: EntitlementReader;
  readonly categories: CategoryReader;
};

/** One cached read: the reader a caller holds. */
type CachedReader<TValue> = {
  readonly get: () => Promise<TValue>;
  readonly clear: () => void;
};

/** A filled cache: the value and the moment it was filled, so expiry is `filledAt + 10s`. */
type CacheEntry<TValue> = {
  readonly value: TValue;
  readonly filledAt: number;
};

/**
 * One process-local cache per reader (DEC-46, amended by DEC-58). The first read fills it, every
 * read before the ten-second deadline serves the filled value without touching the database, and a
 * read at or after the deadline fills it again. A save clears it early through `clear`, called by
 * the notification listener; the expiry stays as the fallback.
 *
 * A concurrent second read while the first is still in flight shares the one query rather than
 * opening a second, so two callers never race a duplicate fill. A clear bumps the generation: a
 * fill that started before it may have read the old row, so it answers its own callers but stores
 * nothing, and a read after the clear starts a new fill instead of joining it.
 */
function createCachedReader<TValue>(
  load: () => Promise<TValue>
): CachedReader<TValue> {
  let entry: CacheEntry<TValue> | undefined;
  let pending: Promise<TValue> | undefined;
  let generation = 0;

  async function fill(): Promise<TValue> {
    const started = generation;

    try {
      const value = await load();

      if (started === generation) {
        entry = { value, filledAt: Date.now() };
      }

      return value;
    } finally {
      if (started === generation) {
        pending = undefined;
      }
    }
  }

  return {
    async get(): Promise<TValue> {
      const cached = entry;

      if (
        cached !== undefined &&
        Date.now() - cached.filledAt < READER_WINDOW_MS
      ) {
        return cached.value;
      }

      pending ??= fill();

      return pending;
    },
    clear(): void {
      generation += 1;
      entry = undefined;
      pending = undefined;
    },
  };
}

/**
 * One row of a single-row table, or a failure naming the seed step that owns the row. The cache
 * never stores a failed read, so a later read retries once the row exists.
 */
function singletonRow<TValue>(rows: readonly TValue[], table: string): TValue {
  const row = rows[0];

  if (row === undefined) {
    // The `seed` step inserts this row (R-20); a deployment that reaches a reader without one is
    // broken, so the read fails rather than inventing a default the schema does not declare.
    throw new Error(`${table} has no row; the seed step has not run`);
  }

  return row;
}

/**
 * Builds the four readers over one database client. They are lazy: building them opens no
 * connection and reads no row (R-19), and each keeps its own cache for the life of its context.
 *
 * `compiledModuleIds` is the one compiled-image list the caller also hands the migrator run
 * (D-12); the entitlement reader answers only for it (R-79).
 */
export function createTenantReaders(input: {
  readonly db: TenantDatabase;
  readonly compiledModuleIds: readonly string[];
}): TenantReaders & { readonly clearAll: () => void } {
  const settings = createCachedReader(async () => {
    const rows = await input.db.select().from(tenantSettings).limit(1);

    return singletonRow(rows, "tenant_settings");
  });

  const branding = createCachedReader(async () => {
    const rows = await input.db.select().from(tenantBranding).limit(1);

    return singletonRow(rows, "tenant_branding");
  });

  // One cached read per compiled module serves both the entitlement and the placement.
  function placementReaderFor(
    moduleId: string
  ): CachedReader<{ enabled: boolean; categoryId: string | null }> {
    return createCachedReader(async () => {
      const rows = await input.db
        .select({
          enabled: tenantModule.enabled,
          categoryId: tenantModule.categoryId,
        })
        .from(tenantModule)
        .where(eq(tenantModule.moduleId, moduleId))
        .limit(1);

      return rows[0] ?? { enabled: false, categoryId: null };
    });
  }

  // One cache per compiled module. An id the image did not compile is answered without a
  // query, so a caller that passes an arbitrary id cannot grow this map.
  const byModule = new Map(
    input.compiledModuleIds.map((moduleId) => [
      moduleId,
      placementReaderFor(moduleId),
    ])
  );

  const entitlements: EntitlementReader = {
    async isEnabled(moduleId: string): Promise<boolean> {
      return (await byModule.get(moduleId)?.get())?.enabled ?? false;
    },
  };

  const categoryRows = createCachedReader(
    async (): Promise<readonly NavigationCategory[]> =>
      input.db
        .select({
          id: category.id,
          name: category.name,
          position: category.position,
        })
        .from(category)
        .orderBy(asc(category.position), asc(category.name))
  );

  const categories: CategoryReader = {
    list: categoryRows.get,
    async ofModule(moduleId: string): Promise<string | null> {
      return (await byModule.get(moduleId)?.get())?.categoryId ?? null;
    },
  };

  // Any notification clears every cache: the four tables change a few times a year.
  function clearAll(): void {
    settings.clear();
    branding.clear();
    categoryRows.clear();

    for (const placement of byModule.values()) {
      placement.clear();
    }
  }

  return { settings, branding, entitlements, categories, clearAll };
}
