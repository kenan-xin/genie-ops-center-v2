import type { PgTable } from "drizzle-orm/pg-core";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Core's own tables. Section 0 creates none, so the deployment tables arrive with the Section 1
 * migration (R-1). The map below is the one known place a core table lands, and core's migration
 * history reads it.
 *
 * Nothing here carries a `tenant_id`: the database is the tenant (ADR 0007). The six
 * person-naming columns and `tenant_module.category_id` stay nullable and carry no foreign key
 * here; the Section 2 migration that creates `user` adds each person key, and the Section 3
 * migration that creates `category` adds the category key (R-2, R-1a, data-shape rules 4 and 7).
 */

/**
 * `bytea` has no pg-core column type, so it is declared here. The driver keeps the bytes as a
 * `Buffer` on the way in and out, and the generated SQL type is the one `information_schema`
 * reports as `bytea`.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const withTimeZone = { withTimezone: true } as const;

/** One row per compiled module, plus retained historical rows after controlled removal. */
export const tenantModule = pgTable("tenant_module", {
  moduleId: text("module_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  enabledAt: timestamp("enabled_at", withTimeZone),
  categoryId: uuid("category_id"),
  config: jsonb("config").notNull().default({}),
});

/** A customer system's key for a module's inbound endpoint, stored hashed and shown once. */
export const tenantApiKey = pgTable("tenant_api_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: text("module_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", withTimeZone),
  revokedAt: timestamp("revoked_at", withTimeZone),
});

/** The resumable setup steps; the step name is also the run order. */
export const setupStep = pgTable("setup_step", {
  step: text("step").primaryKey(),
  state: text("state").notNull(),
  detail: text("detail"),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/** At most one row. `genie-ops retire --confirm` reads it; nothing runs on a schedule. */
export const retirement = pgTable("retirement", {
  retiredAt: timestamp("retired_at", withTimeZone).notNull(),
  deletionHold: boolean("deletion_hold").notNull().default(false),
});

/** A fixed-window counter for the sensitive endpoints; the next window overwrites the row. */
export const rateLimitWindow = pgTable(
  "rate_limit_window",
  {
    endpoint: text("endpoint").notNull(),
    subject: text("subject").notNull(),
    windowStart: timestamp("window_start", withTimeZone).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.endpoint, table.subject, table.windowStart],
    }),
  ]
);

/** The single settings row the tenant administrator owns and that is not branding. */
export const tenantSettings = pgTable("tenant_settings", {
  onboardingMode: text("onboarding_mode").notNull().default("invite"),
  localAccountsEnabled: boolean("local_accounts_enabled")
    .notNull()
    .default(false),
  realmSupportsLocalAccounts: boolean("realm_supports_local_accounts")
    .notNull()
    .default(false),
  sessionIdleMinutes: integer("session_idle_minutes").notNull().default(15),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/**
 * The single branding row. Column inventory does not define seed requiredness (branding-seed.md),
 * so only the four required customer values and the stated defaults are constrained here.
 */
export const tenantBranding = pgTable("tenant_branding", {
  companyName: text("company_name").notNull(),
  productName: text("product_name").notNull(),
  logoLightFileId: uuid("logo_light_file_id"),
  logoDarkFileId: uuid("logo_dark_file_id"),
  logoMarkFileId: uuid("logo_mark_file_id"),
  faviconFileId: uuid("favicon_file_id"),
  primaryColor: text("primary_color"),
  primaryForeground: text("primary_foreground"),
  defaultTheme: text("default_theme").notNull().default("system"),
  fontFamily: text("font_family").notNull().default("plus-jakarta-sans"),
  fontSize: text("font_size").notNull().default("default"),
  textColor: text("text_color"),
  loginBackgroundFileId: uuid("login_background_file_id"),
  loginBackgroundColor: text("login_background_color"),
  loginWelcomeText: text("login_welcome_text"),
  loginNoticeText: text("login_notice_text"),
  loginNoticeRequiresAcknowledgement: boolean(
    "login_notice_requires_acknowledgement"
  )
    .notNull()
    .default(false),
  emailSenderName: text("email_sender_name"),
  emailReplyTo: text("email_reply_to"),
  emailFooterText: text("email_footer_text"),
  supportUrl: text("support_url"),
  supportEmail: text("support_email"),
  termsUrl: text("terms_url"),
  privacyUrl: text("privacy_url"),
  defaultLocale: text("default_locale").notNull(),
  defaultTimeZone: text("default_time_zone").notNull(),
  dateFormat: text("date_format"),
  numberFormat: text("number_format"),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/** Append-only events, kept for the tenant's lifetime and readable with `core:audit:read`. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", withTimeZone).notNull().defaultNow(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("audit_event_target_idx").on(table.targetType, table.targetId),
    index("audit_event_occurred_at_idx").on(table.occurredAt),
  ]
);

/** File metadata. The bytes live in `file_blob`, never recorded on this row (DEC-20). */
export const file = pgTable(
  "file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksum: text("checksum").notNull(),
    scanStatus: text("scan_status").notNull().default("skipped"),
    uploadedByUserId: text("uploaded_by_user_id"),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("file_storage_key_idx").on(table.storageKey)]
);

/** One row per file stored with the `postgres` adapter, so `file` scans never load bytes. */
export const fileBlob = pgTable("file_blob", {
  id: uuid("id").primaryKey().defaultRandom(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
});

/** A module's non-secret connection to a customer system, with a secret reference. */
export const tenantIntegration = pgTable("tenant_integration", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: text("module_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  secretRef: text("secret_ref"),
  status: text("status").notNull().default("active"),
  lastCheckedAt: timestamp("last_checked_at", withTimeZone),
  lastError: text("last_error"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/** Every core table by its SQL name, the one place a core table is registered. */
export const coreTables = {
  tenant_module: tenantModule,
  tenant_api_key: tenantApiKey,
  setup_step: setupStep,
  retirement,
  rate_limit_window: rateLimitWindow,
  tenant_settings: tenantSettings,
  tenant_branding: tenantBranding,
  audit_event: auditEvent,
  file,
  file_blob: fileBlob,
  tenant_integration: tenantIntegration,
} satisfies Readonly<Record<string, PgTable>>;
