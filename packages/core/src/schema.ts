import { sql } from "drizzle-orm";
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
 * person-naming columns stay nullable and each points at `user.id` (R-2, data-shape rule 7);
 * `tenant_module.category_id` stays nullable and still carries no foreign key, because the
 * Section 3 migration that creates `category` adds the category key (data-shape rules 4 and 7).
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
export const tenantApiKey = pgTable(
  "tenant_api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: text("module_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", withTimeZone),
    revokedAt: timestamp("revoked_at", withTimeZone),
  },
  // The inbound endpoint authenticates by hashing the presented key and looking it up, so the
  // hash is unique and indexed. data-shape.md does not list the index; the lookup needs it.
  (table) => [uniqueIndex("tenant_api_key_key_hash_idx").on(table.keyHash)]
);

/** The resumable setup steps; the step name is also the run order. */
export const setupStep = pgTable("setup_step", {
  step: text("step").primaryKey(),
  state: text("state").notNull(),
  detail: text("detail"),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/** At most one row. `genie-ops retire --confirm` reads it; nothing runs on a schedule. */
export const retirement = pgTable(
  "retirement",
  {
    retiredAt: timestamp("retired_at", withTimeZone).notNull(),
    deletionHold: boolean("deletion_hold").notNull().default(false),
  },
  // A constant unique key makes the row a singleton, so the seed can use
  // `INSERT ... ON CONFLICT DO NOTHING` and no second row can race in.
  () => [uniqueIndex("retirement_singleton_idx").on(sql`(true)`)]
);

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
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    onboardingMode: text("onboarding_mode").notNull().default("invite"),
    realmMode: text("realm_mode").notNull().default("managed"),
    keycloakUrlAtSetup: text("keycloak_url_at_setup"),
    localAccountsEnabled: boolean("local_accounts_enabled")
      .notNull()
      .default(false),
    realmSupportsLocalAccounts: boolean("realm_supports_local_accounts")
      .notNull()
      .default(false),
    sessionIdleMinutes: integer("session_idle_minutes").notNull().default(15),
    updatedByUserId: text("updated_by_user_id").references(() => user.id),
    updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
  },
  // A constant unique key makes the row a singleton (data-shape rule 4 keeps every non-user key
  // a UUID, so it is not the primary key), so the seed can use `INSERT ... ON CONFLICT DO
  // NOTHING` and no second row can race in.
  () => [uniqueIndex("tenant_settings_singleton_idx").on(sql`(true)`)]
);

/**
 * The single branding row. Column inventory does not define seed requiredness (branding-seed.md),
 * so only the four required customer values and the stated defaults are constrained here.
 */
export const tenantBranding = pgTable(
  "tenant_branding",
  {
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
    updatedByUserId: text("updated_by_user_id").references(() => user.id),
    updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
  },
  // A constant unique key makes the row a singleton, so the seed can use `INSERT ... ON
  // CONFLICT DO NOTHING` and no second row can race in.
  () => [uniqueIndex("tenant_branding_singleton_idx").on(sql`(true)`)]
);

/** Append-only events, kept for the tenant's lifetime and readable with `core:audit:read`. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", withTimeZone).notNull().defaultNow(),
    actorUserId: text("actor_user_id").references(() => user.id),
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
    scanStatus: text("scan_status").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("file_storage_key_idx").on(table.storageKey)]
);

/** One row per file stored with the `postgres` adapter, so `file` scans never load bytes. */
export const fileBlob = pgTable("file_blob", {
  // No default: R-33 keys the blob by the file id, so a blob that forgets its id must fail
  // rather than write an orphan no `file` row finds.
  id: uuid("id").primaryKey(),
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
  createdByUserId: text("created_by_user_id").references(() => user.id),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/**
 * The Better Auth identity tables, generated once with the Better Auth CLI (better-auth 1.7.6)
 * and copied here; the core schema is then the source of truth (Spec 2 D2-5). The application
 * columns (`banned`, `status`, `is_break_glass` and the rest) are declared `input: false` in the
 * Better Auth configuration, so no Better Auth endpoint writes them; setup steps, operator
 * commands and Add person write them with Drizzle. The one deviation from the CLI output is that
 * timestamps carry the repository's `with time zone` convention, so `session.expires_at` and the
 * rest compare against `now()` like every other core timestamp. No Better Auth runtime code
 * lives here yet (that is S2-04); this is the schema and nothing else.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", withTimeZone),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  status: text("status"),
  mustChangePassword: boolean("must_change_password").default(false),
  isBreakGlass: boolean("is_break_glass").notNull().default(false),
  onboarding: text("onboarding"),
  firstSignInAt: timestamp("first_sign_in_at", withTimeZone),
  lastSignInAt: timestamp("last_sign_in_at", withTimeZone),
  erasedAt: timestamp("erased_at", withTimeZone),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", withTimeZone)
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** A database-backed session; `expires_at` is the fixed 24 hour cap (R-13). */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", withTimeZone).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", withTimeZone)
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

/**
 * One identity-provider or credential account per `user`; the three token columns rest encrypted
 * with the application secret (`encryptOAuthTokens`, R-7).
 */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", withTimeZone),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", withTimeZone),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", withTimeZone)
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

/** Better Auth's store for short-lived values; no application code reads it (data-shape.md). */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", withTimeZone).notNull(),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", withTimeZone)
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

/** The two-factor plugin's row, used by the break-glass account only (DEC-15, R-63). */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", withTimeZone),
  },
  (table) => [
    index("two_factor_secret_idx").on(table.secret),
    index("two_factor_user_id_idx").on(table.userId),
  ]
);

/** A directory group the identity provider sent, or a local group an administrator made. */
export const group = pgTable(
  "group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    externalId: text("external_id"),
    displayLabel: text("display_label"),
    source: text("source").notNull(),
    description: text("description"),
    lastSeenAt: timestamp("last_seen_at", withTimeZone),
    archivedAt: timestamp("archived_at", withTimeZone),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
  },
  // A directory group is one identity-provider id per source; a local group has no external id,
  // so the unique only binds the rows that carry one (data-shape.md, "Groups").
  (table) => [
    uniqueIndex("group_source_external_id_idx")
      .on(table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ]
);

/** A person's membership in a group; `idp` memberships are replaced on every sign-in (R-23). */
export const groupMember = pgTable(
  "group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => group.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    source: text("source").notNull(),
    syncedAt: timestamp("synced_at", withTimeZone).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_member_user_group_idx").on(table.userId, table.groupId),
  ]
);

/** A named role with its permission keys; system roles are seeded by the `roles` step (R-33). */
export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  moduleId: text("module_id"),
  permissions: text("permissions").array().notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", withTimeZone).notNull().defaultNow(),
});

/**
 * One grant of a role to a person or a group, optionally scoped to a record. `principal_id` is
 * text because it names either `user.id` or `group.id`, so it carries no foreign key; a scope is
 * a `type:id` pair, never a foreign key (data-shape rule 3).
 */
export const roleAssignment = pgTable(
  "role_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    scopeType: text("scope_type"),
    scopeId: text("scope_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("role_assignment_unique_idx").on(
      table.roleId,
      table.principalType,
      table.principalId,
      table.scopeType,
      table.scopeId
    ),
    index("role_assignment_principal_idx").on(
      table.principalType,
      table.principalId
    ),
  ]
);

/** An in-app notification written by the same events that send email (R-46). */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", withTimeZone),
    createdAt: timestamp("created_at", withTimeZone).notNull().defaultNow(),
  },
  (table) => [
    index("notification_user_read_created_idx").on(
      table.userId,
      table.readAt,
      table.createdAt
    ),
  ]
);

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
  user,
  session,
  account,
  verification,
  two_factor: twoFactor,
  group,
  group_member: groupMember,
  role,
  role_assignment: roleAssignment,
  notification,
} satisfies Readonly<Record<string, PgTable>>;
