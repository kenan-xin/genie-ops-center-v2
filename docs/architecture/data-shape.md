# Genie Ops Center: Data Shape

Status: draft for review, 2026-09-17. This is the general shape of the one database, not the migration. Module tables are documented in each module's `../modules/<module>/README.md` and follow the rules below.

## One database per deployment

A deployment serves one customer and has one Postgres database (ADR 0007). It holds every user, session, group, role, audit event, module record, deployment table, and job for that customer. It has no `tenant_id` column anywhere, because the database is the tenant. Every database receives the same set of migration histories: one for core and one per module in the image (`DEC-33`). Infrastructure values such as the public URL, the realm, and the file adapter come from the environment (`environment-contract.md`), never from a table, so a database restored into another stack works unchanged.

## Rules

1. Core owns identity, groups, roles, branding, audit, and storage references. A module owns its own tables and never writes to another module's tables.
2. Each module ships its own Drizzle schema file and its own drizzle-kit migration history with its own migrations table. The migrator applies the core history first and then each included module's history (`DEC-33`).
3. Every module record that has an owner references `user.id`. Every scope in a role assignment references a resource by type and id, never by foreign key, so core does not depend on module tables.
4. Identifiers: `user.id` is text (Better Auth). All other primary keys are UUID.
5. Timestamps: `created_at` and `updated_at` on every table that a person edits.
6. Files go through the core `FileStorage` interface. A `file` row holds the metadata; the bytes live in `file_blob` by default, or in object storage when the deployment sets the `s3` adapter in the environment. Modules never read or write bytes directly.
7. A column that references `user.id` in a table created before the `user` table exists (the Section 1 tables: `tenant_settings.updated_by_user_id`, `tenant_branding.updated_by_user_id`, `audit_event.actor_user_id`, `file.uploaded_by_user_id`, `tenant_api_key.created_by`, `tenant_integration.created_by_user_id`) is nullable and gains its foreign key in the Section 2 migration that creates `user` (`../core/roadmap.md`, Section 1 item 1).

## Deployment tables

`tenant_module`: module_id (primary key; text, the module's declared id), enabled, enabled_at, category_id (nullable, a core `category` id that places the module's static workspace entries in the navigation tree, `DEC-51`; created without a foreign key in Section 1 and given one in the Section 3 migration that creates `category`), config (jsonb, validated against the module's configuration schema; module settings such as an approval threshold or a default office; the solutions module has none). One row per compiled module, plus retained historical module rows after controlled removal. First-time setup retains its initial activation policy; a newly introduced module on an already configured deployment is registered disabled until an authorized administrator configures and explicitly enables it (DEC-50 addendum; Section 1 R-27/R-68a). Startup preserves existing enabled states and administrator-owned values; registration alone creates no person/group access assignments. Permission evolution follows [its accepted policy](permission-evolution.md). Removal/reintroduction follows [the removal policy](module-removal.md): preserve historical state, register returning modules disabled, and require reviewed explicit activation. Durable installed-identity/removal-completion and review evidence must distinguish a returning module from an ordinary disabled one; exact schema and reconciliation ownership remain implementation-design gates. Disabling a row hides the module without a rebuild, from the Modules page in the admin portal or with `genie-ops module disable`, through one core procedure (`DEC-50`).

`tenant_api_key`: id, module_id, name, key_hash, created_by, created_at, last_used_at, revoked_at. Authenticates a customer system calling a module's inbound endpoint under `/api/m/<module>/...`. The key is shown once and stored hashed. Core ships no screen for it: the first module with an inbound endpoint issues and revokes keys from its admin screen through a core procedure.

`setup_step`: step (primary key; `migrations`, `seed`, `realm`, `clients`, `roles`, `admin_seed`, `break_glass`), state (`pending`, `done`, `failed`), detail, updated_at. That list is also the run order: `seed` runs right after `migrations` and inserts the `tenant_module` rows and seeds `tenant_settings` and `tenant_branding`, so the `roles` step later finds every compiled module's entitlement when it seeds default roles (`../core/roadmap.md`, Section 1 item 5). Makes `genie-ops setup` resumable. Until every step is done, the application shows the not-set-up page. The identity provider is not a step: `genie-ops idp set` runs after setup and a local-accounts deployment never runs it (`DEC-36`).

`retirement`: one row at most: retired_at, deletion_hold (boolean). `genie-ops retire --confirm` deletes after 90 days and refuses earlier or while the hold is set; nothing runs on a schedule (`DEC-17`).

`rate_limit_window`: endpoint, subject, window_start (primary key on the three), count. A fixed-window counter for the sensitive endpoints (`DEC-31`); the next window overwrites the row, so no sweeper exists.

The pg-boss job tables live in the same database in their own schema (`DEC-12`).

## Core tables

### Identity (Better Auth, generated)

`user`: id, name, email (unique; from the token for a brokered account, changed only by an administrator for a local account, audited; never self-service, `DEC-32`), email_verified, image (reserved for a token-supplied picture; no upload), role (multi-value text, `user` or `user,admin`), banned, ban_reason, ban_expires, status (`active` or `pending`), must_change_password, is_break_glass (boolean, default false; the one account that bypasses `can()`, hidden from People, Groups, and Roles), onboarding (`invited` or `jit`), first_sign_in_at (nullable), last_sign_in_at (nullable), erased_at (nullable), created_at, updated_at. Personal erasure (`DEC-17`) sets `erased_at`, replaces `name` with `Erased person`, replaces `email` with `erased-<id>@invalid`, clears `image`, sets `banned`, and deletes the person's account and session rows. Every other column, the id, and the audit events that name the id stay. While `must_change_password` is true or the break-glass authenticator is not enrolled, the session is limited: `can()` and every router refuse except the endpoints that clear the condition.

Self-protection, server-enforced: a person cannot disable or remove themselves, and the last holder of `Tenant administrator` cannot be removed, disabled, or stripped of the role. Disable sets `banned` and keeps memberships and assignments. Remove sets `banned`, deletes the person's sessions, group memberships, and direct role assignments, and keeps the name, the email, and the audit trail; a removed person who signs in again is refused. Only `genie-ops erase` anonymizes (`DEC-14`, `DEC-17`; decided 2026-09-18).

`session`: id, user_id, token (unique), expires_at, ip_address, user_agent, impersonated_by, created_at, updated_at. `ip_address` is taken from the request after the deployment's trusted proxy list (`AUTH_TRUSTED_PROXIES`) so it survives a load balancer; the account and People screens show it as the session's IP address, not a geographic location.

`account`: id, user_id, provider_id (`credential` or `keycloak`), account_id, access_token, refresh_token, id_token, token expiry fields, scope, password, created_at, updated_at. A `credential` row exists only for the break-glass admin. The three token columns belong to the Better Auth schema. The sign-out path reads `id_token` once for the realm's `id_token_hint` (`DEC-11`) and nothing else in Genie Ops Center reads them, so the instance sets `encryptOAuthTokens` and they rest encrypted with the application secret.

`verification`: id, identifier, value, expires_at, created_at, updated_at. Better Auth's own store for short-lived values such as the sign-in state and one-time tokens. No application code reads it and no screen shows it.

`two_factor`: id, user_id, secret, backup_codes, verified, failed_verification_count, locked_until. Added by the Better Auth two-factor plugin and used by the break-glass account only (`DEC-15`). Managed from that account's own account page variant.

`status` is `pending` for a person an administrator pre-added who has not signed in yet, and `active` after the first sign-in or when created under `jit` onboarding. `must_change_password` serves the break-glass admin path only.

### Tenant settings

`tenant_settings`: one row. onboarding_mode (`invite` or `jit`, default `invite`), local_accounts_enabled (default false; when true, "Add person" also creates the account in the tenant realm), realm_supports_local_accounts (default false; written once by the `realm` step of `genie-ops setup` from the template variant it applied, `DEC-36`; the Local accounts switch on Tenant Settings is disabled while it is false, and no page reads the realm for it), session_idle_minutes (default 15), updated_by_user_id (nullable; the foreign key to `user` arrives with that table in Section 2, so setup writes null), updated_at. Settings the tenant administrator owns and that are not branding.

### Groups

`group`: id, name, external_id (nullable, the identity provider's group id or name), source (`idp` or `local`), description, last_seen_at (nullable; the last sign-in token that carried this directory group), archived_at (nullable), created_at, updated_at. Unique on (source, external_id) where external_id is not null. A directory group whose `last_seen_at` is older than its members' recent sign-ins is shown as stale; it can be archived, never deleted. An archived group keeps its `role_assignment` rows, but they stop granting while `archived_at` is set: `can()` and `scopesFor()` skip assignments whose group principal is archived, and restoring the group brings them back (decided 2026-09-18). The Archive confirm names how many assignments stop.

`group_member`: group_id, user_id, source (`idp` or `local`), synced_at. Primary key on (group_id, user_id). Index on (user_id, group_id). Memberships with source `idp` are replaced on each sign-in from the token's `groups` claim when the claim is present, even when it is empty. When the claim is absent, the memberships stay as they are and the sign-in writes the audit event `auth:groups_claim_absent` (`DEC-41`). A local group can be deleted; deletion removes its role assignments and memberships after a confirm step that names both counts. A directory group is archived, never deleted.

### Navigation

`category`: id, name (unique), position, created_at, updated_at. Created by the Section 3 migration together with `user_preference` (`../core/roadmap.md`, Section 3 items 7 and 11). One list of headings for the whole navigation tree, managed on the Categories page in the admin portal. A module row names a category by id and treats a missing category as no category, so deleting a category touches no module table (`DEC-51`).

### Roles and permissions

Upgrade semantics are governed by [Permission and system-role evolution](permission-evolution.md). A role's stored ID is preserved across display renames and equivalent key migrations. Custom copies are independent, new definitions grant nothing by themselves, and unknown/retired keys in the permissions array grant no effective authority. Do not infer permission to overwrite an existing system role from idempotent seeding.

`role`: id, name (unique), description, module_id (nullable, the module that declared a default role), permissions (text array of permission keys such as `solutions:use` or `<module>:approve`), is_system, created_at, updated_at. Default roles are seeded when the module's `tenant_module` row is enabled, and are marked `is_system` so an administrator can copy but not delete them.

`role_assignment`: id, role_id, principal_type (`user` or `group`), principal_id (text), scope_type (nullable text, for example `office`, `solution`, or any record type a module declares), scope_id (nullable text), created_by_user_id, created_at. Unique on (role_id, principal_type, principal_id, scope_type, scope_id). Index on (principal_type, principal_id).

Core declares its own permission keys like a module: `core:people:manage`, `core:groups:manage`, `core:roles:manage`, `core:branding:manage`, `core:settings:manage`, `core:audit:read`. Two core system roles are seeded at provisioning: `Tenant administrator` (all six) and `Auditor` (`core:audit:read`). Enabling a module entitlement appends that module's admin permission key to `Tenant administrator`, so administrators always reach every entitled module's admin screens, and disabling it removes the key again. Setup also seeds the local group `Genie Administrators` holding `Tenant administrator` tenant-wide, with the initial administrators from `tenant.yaml` pre-added as pending members.

A null scope means the whole tenant. `can(user, permission, resource?)` collects the user's id and group ids as principals, loads their assignments, and returns true when any assignment's role carries the permission and its scope is null or matches the resource or one of its declared parents. The only bypass is `user.is_break_glass`. `scopesFor(user, permission)` reads the same assignments and returns `all` when one has a null scope, otherwise the list of scopes as type and id pairs. A module's list query filters on that result, on its record id and its declared parent columns (`DEC-39`).

### Branding

`tenant_branding`: one row.

- Identity: company_name, product_name, logo_light_file_id, logo_dark_file_id, logo_mark_file_id, favicon_file_id.
- Colors: primary_color and primary_foreground (one brand color; the foreground is computed and stored, never authored, so `branding.seed.json` omits it and `genie-ops setup` derives it with the same rule a branding save uses, `DEC-47`, `DEC-35`), default_theme (`light`, `dark`, `system`), font_family (a key from the approved list: `plus-jakarta-sans` (default), `ibm-plex-sans`, `manrope`, `source-serif-4`; the list is a constant in `packages/ui` and grows only by a pull request that adds the self-hosted font files). Emails use the same family in the HTML part with a system font stack as fallback; Keycloak credential emails carry no branding (`DEC-40`).
- Typography: font_size (`compact`, `default`, `large`, default `default`; the root font size in the browser, 14, 15, or 16 px, and the type scale is rem-based so it follows), text_color (heading and body color on light surfaces, contrast-checked like primary_color; the dark theme keeps its fixed value) (`DEC-47`).
- Sign-in page: login_background_file_id, login_background_color, login_welcome_text, login_notice_text (the system-use notice, nullable), login_notice_requires_acknowledgement.
- Email: email_sender_name, email_reply_to (an email address), email_footer_text.
- Links: support_url, terms_url, privacy_url (each an HTTP or HTTPS URL), support_email (an email address). Each link is optional, and an unset link renders no entry.
- Locale: default_locale, default_time_zone, date_format, number_format.
- Bookkeeping: updated_by_user_id (nullable, foreign key added with `user` in Section 2), updated_at.

`user_preference`: user_id (primary key), locale (nullable), time_zone (nullable), theme (nullable), updated_at. A person's overrides of the tenant defaults.

### Files

`file`: id, storage_key (unique; an opaque key that every adapter derives from the file id, so the row never records which store holds the bytes, `DEC-20`), file_name, mime_type, size_bytes, checksum, scan_status (`pending`, `clean`, `infected`, `skipped`; `skipped` until a scanner exists, and `pending` is entered only once a scanner exists), uploaded_by_user_id, created_at. Modules reference `file.id`. A file is served only when `scan_status` is `clean` or `skipped`, through a short-lived tokenized link issued after a `can()` check on the owning record.

`file_blob`: id, bytes (bytea), created_at. One row per file stored with the `postgres` adapter. Kept in its own table so `file` scans never load bytes.

### Integrations

`tenant_integration`: id, module_id, kind (text, for example `s3`, `sharepoint`, `smb`, `http`), name, config (jsonb, non-secret values such as host, bucket, base path), secret_ref (nullable; a name in the secret store, never a credential), status (`active`, `disabled`, `error`), last_checked_at, last_error, created_by_user_id, created_at, updated_at. A module reads its own integrations through core and uses them to reach a customer system that is not Genie's file store. Credentials never enter a tenant database. Core ships no integration screen: the first module that needs a connector ships the screen through its pages slot, and core lifts it into Tenant Settings when a second module needs one.

### Notifications

`notification`: id, user_id, kind (text, `module:event`), title, body, link, read_at (nullable), created_at. Index on (user_id, read_at, created_at desc). Written by the same events that send email; the inbox screen comes later.

### Audit

`audit_event`: id, occurred_at, actor_user_id (nullable for system; created in Section 1 with the deployment tables, foreign key added with `user` in Section 2), action (text, `module:verb`), target_type, target_id, summary, metadata (jsonb). Append-only, kept for the tenant's lifetime, readable with `core:audit:read`. A `genie-ops` command writes a row with `actor_user_id` null, `action` `ops:<command>`, and the operating-system user, the non-secret arguments, and the outcome in `metadata` (`DEC-45`). Index on (target_type, target_id) and on occurred_at. Erasing a person keeps their events under the anonymized user id.

## Module tables

Each module owns its tables in the same database and documents them in `../modules/<module>/README.md`. The rules a module's tables must follow:

1. Table names carry no module prefix unless two modules would otherwise collide; the module's schema file is the namespace in code.
2. A module references core tables by id: `user.id` for owners and actors, `group.id` for recipients, `file.id` for documents, `category.id` for a place in the navigation tree. It never references another module's tables.
3. A module declares its permission keys and default roles in code. Access to one of its records is a `role_assignment` with scope `<type>:<id>`, never a module-owned grant table.
4. A module writes to `audit_event` for record changes and to no other core table.
5. A module's tables exist when the image includes the module, enabled or not. An image that excludes a module creates none of its tables (`DEC-33`); it does not delete tables or applied migration history retained from a previously installed module after controlled removal.

## Relationships across the boundary

```
deployment:     tenant_module 1..1 compiled module or retained removed-module identity (by module_id)

core:           user 1..* group_member *..1 group
                role 1..* role_assignment  (principal = user or group; scope = null | <type>:<id>)
                user 1..* audit_event (actor)
                category 0..* tenant_module, <module record> (by category id, no foreign key from a module)
                file 1..* <module record>, tenant_branding (logo, favicon)
```

Modules reference core tables by id. Core references module records only by (scope_type, scope_id) text pairs, never by foreign key. This is what lets one set of migration histories serve customers with different modules, and lets a customer's image leave out a module's history entirely.

## What is not modeled

- A `tenant_id` column, a tenant registry, or a hostname table. Isolation is the deployment and its database (ADR 0007).
- Password history for employees. Employees have no password.
- Authorization policy language. Roles and scoped assignments cover the known cases. A relationship-based engine is the upgrade path behind the `can()` seam.
