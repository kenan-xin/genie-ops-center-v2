import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { tenantBranding, tenantModule, tenantSettings } from "../../schema.ts";

/**
 * The three changing tenant readers of R-5: settings over `tenant_settings`, branding over
 * `tenant_branding`, and entitlements over `tenant_module`. This module is the only place in
 * core that reads those tables (R-7); the migrator run, the `seed` step and the enable
 * procedure write them, and every other caller reads through a context that this file built.
 */

/** The Drizzle client every reader reads through. The pool and its `$client` stay on the context. */
type TenantDatabase = NodePgDatabase<Record<string, never>>;

/** How long a filled cache serves its value before the reader reads the row again (DEC-46). */
const CACHE_TTL_MS = 10_000;

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

export type TenantReaders = {
  readonly settings: SettingsReader;
  readonly branding: BrandingReader;
  readonly entitlements: EntitlementReader;
};

/** One cached read: the reader a caller holds. */
type CachedReader<TValue> = {
  readonly get: () => Promise<TValue>;
};

/** A filled cache: the value and the moment it was filled, so expiry is `filledAt + 10s`. */
type CacheEntry<TValue> = {
  readonly value: TValue;
  readonly filledAt: number;
};

/**
 * One process-local cache per reader (DEC-46). The first read fills it, every read before the
 * ten-second deadline serves the filled value without touching the database, and a read at or
 * after the deadline fills it again. Nothing invalidates it early: no save clears it, no
 * notification channel exists, and no process restarts on a change.
 *
 * A concurrent second read while the first is still in flight shares the one query rather than
 * opening a second, so two callers never race a duplicate fill.
 */
function createCachedReader<TValue>(
  load: () => Promise<TValue>
): CachedReader<TValue> {
  let entry: CacheEntry<TValue> | undefined;
  let pending: Promise<TValue> | undefined;

  async function fill(): Promise<TValue> {
    try {
      const value = await load();

      entry = { value, filledAt: Date.now() };

      return value;
    } finally {
      pending = undefined;
    }
  }

  return {
    async get(): Promise<TValue> {
      const cached = entry;

      if (cached !== undefined && Date.now() - cached.filledAt < CACHE_TTL_MS) {
        return cached.value;
      }

      pending ??= fill();

      return pending;
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
 * Builds the three readers over one database client. They are lazy: building them opens no
 * connection and reads no row (R-19), and each keeps its own cache for the life of its context.
 *
 * `compiledModuleIds` is the one compiled-image list the caller also hands the migrator run
 * (D-12); the entitlement reader answers only for it (R-79).
 */
export function createTenantReaders(input: {
  readonly db: TenantDatabase;
  readonly compiledModuleIds: readonly string[];
}): TenantReaders {
  const compiled = new Set(input.compiledModuleIds);

  const settings = createCachedReader(async () => {
    const rows = await input.db.select().from(tenantSettings).limit(1);

    return singletonRow(rows, "tenant_settings");
  });

  const branding = createCachedReader(async () => {
    const rows = await input.db.select().from(tenantBranding).limit(1);

    return singletonRow(rows, "tenant_branding");
  });

  function entitlementReaderFor(moduleId: string): CachedReader<boolean> {
    return createCachedReader(async () => {
      const rows = await input.db
        .select({ enabled: tenantModule.enabled })
        .from(tenantModule)
        .where(eq(tenantModule.moduleId, moduleId))
        .limit(1);

      return rows[0]?.enabled ?? false;
    });
  }

  // One cache per compiled module. An id the image did not compile is answered false without a
  // query, so a caller that passes an arbitrary id cannot grow this map.
  const byModule = new Map(
    input.compiledModuleIds.map((moduleId) => [
      moduleId,
      entitlementReaderFor(moduleId),
    ])
  );

  const entitlements: EntitlementReader = {
    async isEnabled(moduleId: string): Promise<boolean> {
      if (!compiled.has(moduleId)) return false;

      // `byModule` is built from the same list as `compiled`, so every compiled
      // id already has a reader and the `?? false` only satisfies the type.
      return byModule.get(moduleId)?.get() ?? false;
    },
  };

  return { settings, branding, entitlements };
}
