import type { Pool } from "pg";

import type { tenantBranding, tenantSettings } from "../../schema.ts";

/**
 * The three changing tenant readers of R-5: settings over `tenant_settings`, branding over
 * `tenant_branding`, and entitlements over `tenant_module`. This module is the only place in
 * core that reads those tables (R-7); the migrator run, the `seed` step and the enable
 * procedure write them, and every other caller reads through a context that this file built.
 *
 * Each reader reads through the context's own pool with a parameterized statement, so a read is
 * one query on the pool the caller supplied and nothing here holds a connection of its own
 * (DEC-34). The statement aliases every column to the name the table's schema type uses, so a
 * caller reads the same shape the Drizzle schema declares.
 */

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
 * switched the module on, and never whether a caller may use it. A module the image did not
 * compile, or a compiled module with no `tenant_module` row, reads as disabled (R-5).
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

const SETTINGS_SQL = `select onboarding_mode as "onboardingMode",
  local_accounts_enabled as "localAccountsEnabled",
  realm_supports_local_accounts as "realmSupportsLocalAccounts",
  session_idle_minutes as "sessionIdleMinutes",
  updated_by_user_id as "updatedByUserId",
  updated_at as "updatedAt"
from tenant_settings
limit 1`;

const BRANDING_SQL = `select company_name as "companyName",
  product_name as "productName",
  logo_light_file_id as "logoLightFileId",
  logo_dark_file_id as "logoDarkFileId",
  logo_mark_file_id as "logoMarkFileId",
  favicon_file_id as "faviconFileId",
  primary_color as "primaryColor",
  primary_foreground as "primaryForeground",
  default_theme as "defaultTheme",
  font_family as "fontFamily",
  font_size as "fontSize",
  text_color as "textColor",
  login_background_file_id as "loginBackgroundFileId",
  login_background_color as "loginBackgroundColor",
  login_welcome_text as "loginWelcomeText",
  login_notice_text as "loginNoticeText",
  login_notice_requires_acknowledgement as "loginNoticeRequiresAcknowledgement",
  email_sender_name as "emailSenderName",
  email_reply_to as "emailReplyTo",
  email_footer_text as "emailFooterText",
  support_url as "supportUrl",
  support_email as "supportEmail",
  terms_url as "termsUrl",
  privacy_url as "privacyUrl",
  default_locale as "defaultLocale",
  default_time_zone as "defaultTimeZone",
  date_format as "dateFormat",
  number_format as "numberFormat",
  updated_by_user_id as "updatedByUserId",
  updated_at as "updatedAt"
from tenant_branding
limit 1`;

const ENTITLEMENT_SQL = `select enabled
from tenant_module
where module_id = $1
limit 1`;

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
 * Builds the three readers over one pool. They are lazy: building them opens no connection and
 * reads no row (R-19), and each keeps its own cache for the life of its context.
 *
 * `compiledModuleIds` is the one compiled-image list the caller also hands the migrator run
 * (D-12). The entitlement answer is the `tenant_module` row's, so a module that is not compiled
 * still reads as disabled when it has no row; the list seeds the per-module caches so every
 * module the image carries has a reader before it is asked about.
 */
export function createTenantReaders(input: {
  readonly pool: Pool;
  readonly compiledModuleIds: readonly string[];
}): TenantReaders {
  const settings = createCachedReader(async () => {
    const result = await input.pool.query<TenantSettings>(SETTINGS_SQL);

    return singletonRow(result.rows, "tenant_settings");
  });

  const branding = createCachedReader(async () => {
    const result = await input.pool.query<TenantBranding>(BRANDING_SQL);

    return singletonRow(result.rows, "tenant_branding");
  });

  function entitlementReaderFor(moduleId: string): CachedReader<boolean> {
    return createCachedReader(async () => {
      const result = await input.pool.query<{ enabled: boolean }>(
        ENTITLEMENT_SQL,
        [moduleId]
      );

      return result.rows[0]?.enabled ?? false;
    });
  }

  // One cache per module, seeded from the compiled list. An id outside the list is still answered
  // from the table: a retained row outlives the module that owned it (module-removal.md), and a
  // missing row reads as disabled either way (R-5).
  const byModule = new Map(
    input.compiledModuleIds.map((moduleId) => [
      moduleId,
      entitlementReaderFor(moduleId),
    ])
  );

  const entitlements: EntitlementReader = {
    async isEnabled(moduleId: string): Promise<boolean> {
      let reader = byModule.get(moduleId);

      if (reader === undefined) {
        reader = entitlementReaderFor(moduleId);
        byModule.set(moduleId, reader);
      }

      return reader.get();
    },
  };

  return { settings, branding, entitlements };
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
