# Genie Ops Center: Product Vision

Status: draft for review, 2026-09-16. Open decisions are marked `OPEN` and listed at the end.

## One sentence

Genie Ops Center is the enterprise application platform that Genie builds once and runs for each customer separately. It carries a shared core (identity, access, people, branding, audit, AI chat) and business modules, and each customer runs its own deployment with its own image, its own database, its own identity realm, and only its own modules.

## Product shape

| Area | Shape |
| --- | --- |
| Product | One application, one repository, one Dockerfile. Each customer's image carries core plus that customer's modules and nothing else (`DEC-33`). |
| Tenancy | One deployment per customer: one image, one database, one Keycloak realm, hosted on Genie's servers or in the customer's own infrastructure (ADR 0007). The word tenant means the one customer of a deployment. |
| Modules | A module is a business capability. A tenant sees a module only when it holds an entitlement for it. |
| Sign-in | The customer's own identity provider, brokered through Keycloak. Microsoft Entra ID is one example. OpenID Connect and SAML 2.0 are supported through Keycloak. LDAP or Active Directory federation is deferred until a customer asks (Specification 02, "Deferred"); Keycloak supports it, so the path back is configuration, not a redesign. A customer with no identity provider uses local accounts in its own realm: Keycloak holds the passwords and sends the invite and reset emails, and the customer can add a provider later without re-onboarding anyone. |
| Access | Roles made of permissions, assigned to groups or people at a scope. Groups come from the customer's identity provider. |
| Branding | The customer's IT administrator configures the tenant's identity, colors, and sign-in page from the admin portal. Typography, email, links, and locale are set in the branding seed at setup, and get admin-portal tabs when a customer asks. |
| Repository | One monorepo managed with pnpm workspaces and Nx: `apps/genie`, `packages/core`, `packages/ui`, `packages/modules/*`. |

## Who it serves

Member. A customer employee. Signs in with their company account. Sees only the modules and records their roles grant.

Customer IT administrator. Decides who can enter (in their identity provider) and what people can do (roles and groups in the admin portal). Sets the tenant's branding. Never sees another tenant.

Customer business user of a module. The person a customer module is built for, for example a business user who needs to find a record and understand it without asking the department that owns it. Each module names its own users in `../modules/<module>/README.md`.

Genie operator. Sets up a customer's deployment: builds its image, creates its database and its Keycloak realm with the customer's identity provider, and runs the stack on Genie's servers or hands it to the customer. Every deployment comes from one codebase and one Dockerfile.

## Key problems

1. Customers in government, healthcare, and finance require strong data isolation and control over where data is stored and processed. A shared database with a tenant column does not satisfy their security teams.
2. Customers need enterprise sign-in with their own identity provider, and offboarding there must lock a person out of Genie Ops Center within 24 hours, without a new sign-in ever succeeding.
3. Enterprise permission models vary: by department, by office, by role, by record. The platform must express all of them without a rewrite per customer.
4. Modules are customer-specific today, because the team does not yet have the experience and data to make them reusable. The platform must allow that reuse later without a migration.
5. Each customer brings business needs that no generic product covers. The platform must let a module be built for one customer quickly, on shared identity, access, branding, audit, and storage, and let it be offered to another customer later by entitlement alone.

## Product principles

1. The database is the tenant. No tenant column exists in any table. Isolation comes from separate deployments, separate databases, and separate realms.
2. The application is hosting-agnostic. The same Dockerfile builds every customer's image, and the images differ only in which modules are compiled in. Nothing in code knows whether Genie or the customer hosts it. Every read of the database, settings, branding, or files goes through one tenant context object (`DEC-34`), so a later return to many customers in one process changes how that object is built and nothing else.
3. Core is the same for every tenant and is a library, not an application. `apps/genie` is the standard composition of core, ui, and modules; a customer who needs a different experience gets another composition, never a fork of core. A module is the unit of customer capability, and an entitlement is the switch.
4. A module becomes reusable by granting a second tenant the entitlement. Nothing moves.
5. Identity comes from the customer's identity provider through Keycloak. Genie Ops Center never becomes a password store for customer employees.
6. Authorization lives in one seam. Every module declares its permissions, checks one resource through the same `can()` call, and lists records through `scopesFor()` (`DEC-39`).
7. Boring first. A module ships its plain workflow before its AI features.
8. Open to extension, closed to modification. When a capability is deferred, the decision that defers it names the path that reopens it and the guard that keeps that path open, so adding it later is an addition, never a rewrite. Examples: `DEC-20` blob migration between adapters, `DEC-34` a return to many tenants in one process, `DEC-39` a subquery instead of a scope list, `DEC-40` branded credential emails.
9. Core knows no module. Core is complete with no business module compiled in, because not every customer gets every module. Core code never names a module, never reads a module's tables, and never branches on whether a module is present. The one exception is `packages/core/contracts`, which holds the data shapes of events that two modules share and no behavior (`DEC-42`). A module depends on core, never the other way. When one module needs something core does not offer, core gains a generic seam that any module can use through the module contract, and the placeholder module proves it. Guard: the oxlint `no-restricted-imports` rule refuses a core import of a module, review refuses a module id in core source outside tests, fixtures, and examples, and a deployment whose image holds no business module must start and pass its core tests.
10. A well-maintained library before our own code (owner principle, 2026-10-20). We keep the code we write and maintain as small as possible. When a well-known, actively maintained library with a compatible licence solves the problem, we use it instead of building our own, and we build only the part no library covers. The order of checks is in `CLAUDE.md` (Dependencies): the standard library, `tech-stack.md`, es-toolkit, then a maintained library. Guard: a change that adds a helper, a renderer, or an engine of our own names the libraries it considered and why each did not fit, and every new library gets a `tech-stack.md` entry in the same change.

## Features

### Core (every tenant)

- One public URL per deployment, `<slug>.genie.example` on Genie's servers or the customer's own domain, with the certificate at the reverse proxy (`DEC-19`).
- Sign-in through the tenant's Keycloak realm, which brokers the customer's identity provider.
- Local accounts for a tenant without an identity provider: the tenant's realm holds the accounts and passwords, enforces password policy and brute-force protection, offers an authenticator app as a second factor, and sends the set-password and reset emails. "Add person" in People creates the realm account and sends the invitation. Genie Ops Center speaks OIDC to the realm exactly as for a brokered tenant. When a provider is added later, existing accounts link by email on first sign-in.
- Onboarding mode per tenant, set by the tenant administrator. `invite` (default): an administrator adds a person by email in People, may assign roles at once, and the first sign-in activates the person; an email with no record is refused with a clear message. `jit`: the same pre-add path exists, and an email with no record is created active on first sign-in only when the person's `groups` claim holds at least one directory group mapped to a Genie Ops Center role; otherwise it is refused like in `invite` (per-app access, amended 2026-09-27). In both modes, groups sync from the token at every sign-in.
- One break-glass administrator per tenant with a password, hidden from the normal sign-in page.
- Sessions that expire after 15 minutes of inactivity, revocable by an administrator.
- People: list, disable, re-enable, remove, view sessions.
- Groups: sourced from the identity provider through a normalized groups claim, with local groups allowed for tenants whose provider sends none.
- Roles and permissions: each module declares permission keys. A role is a named set of permission keys. A role is assigned to a group or a person, either tenant-wide or at a scope such as an office or a single record. One function, `can(user, permission, resource?)`, answers every check.
- Branding, configured by the tenant's administrator with live preview (Identity, Colors, and Sign-in page in the first release; Typography, Email, Links, and Locale come from the branding seed until a customer asks for their tabs, owner decision 2026-10-19):
  - Identity: company name, product display name, logo for light and dark backgrounds, square logo mark for small spaces, favicon.
  - Colors: one primary color, with its foreground color computed and a contrast check that rejects an unreadable pair (`DEC-47`). Default theme: light, dark, or follow the device.
  - Typography: font family chosen from an approved list, a font size preset (compact, default, large) that sets the root font size, and the text color for light surfaces, contrast-checked. No font upload.
  - Sign-in page: background image or color, welcome text, support contact, and a system-use notice shown before sign-in for tenants whose policy requires one.
  - Email: sender display name, reply-to address, footer text, logo in the header.
  - Links: support URL or email, terms of use URL, privacy policy URL, shown in the shell footer.
  - Locale: default language, time zone, date and number format. A person may override language and time zone for themselves.
  - Everything outside this list is fixed by the design system and cannot be changed per tenant.
- Audit log: who did what, when, on which record.
- File storage: a core service for logos, favicons, and module documents. Bytes live in the tenant database by default; a tenant can instead be configured to use its own S3-compatible bucket (`DEC-20`).
- Integrations: a core record per tenant for a module's connection to a customer system (a file share, a document system, a bucket), holding configuration and a secret reference. The module owns the connector; core owns the record and the secret handling.
- Email: a pluggable mailer with React Email templates and tenant branding for every email Genie Ops Center initiates (invitations, role changes, module notifications). Hosted provider or SMTP, chosen per deployment. Credential emails for local-account tenants are sent by Keycloak with its built-in templates (`DEC-11`, `DEC-40`).
- Shell: navigation that shows only the entitled modules the signed-in person can reach. Account page with active sessions.
- Design system: a fixed token layer from the design owner and a small tenant layer bound to branding. Every screen is designed mobile first, including the admin portal (`DEC-25`).

### Deployment (operators only)

- One stack per customer: application, job worker, Keycloak, and the customer's Postgres and SMTP, from a generated compose file or Helm values.
- Module entitlements: the modules compiled into the customer's image, each switchable off in the database without a rebuild, from the Modules page in the admin portal or with `genie-ops module enable|disable` (`DEC-50`).
- Setup: `genie-ops setup` migrates the database, creates the realm from the template with a one-run server credential (`DEC-37`), or in client-only mode skips it (ADR 0010), seeds roles and the first administrators, and creates the break-glass account. Resumable. The identity provider is added afterwards by `genie-ops idp set` (`DEC-36`).
- Migration at container start, before serving.

### Modules

Modules are not part of the core product and are documented separately, one folder each under `../modules/`. The core ships one platform module, solutions, to every tenant; every other module is built for a customer and offered to others by entitlement. `../modules/README.md` lists them with their status. The core's obligations to a module are the module contract: schema, router, permission keys, default roles, navigation, pages, tests, and nothing else.

## Non-goals

- A shared database with a `tenant_id` column, or many customers in one process. Isolation is by deployment and by database (ADR 0007).
- Authorization inside Keycloak. Keycloak authenticates and supplies groups. The application authorizes.
- Building the AI model. Genie Ops Center calls the external Genie chat API.
- Self-service customer sign-up. Entry is always through the customer's identity provider or an administrator action.
- A general workflow engine before a module needs one and has a scope.
- SCIM provisioning in the foundation. Listed as a later capability for customers who require push-based joiners and leavers.

## Decided

Product/configuration reasoning lives in [the decision log](decision-log.md); architectural decisions live in [the ADR directory](../adr/). The table is the index.

| Id | Decision |
| --- | --- |
| DEC-1 | One deployment per customer: one image, one database, one realm, no tenant column, no connection router. Hosted by Genie or by the customer from the same Dockerfile. ADR 0007, which supersedes the shared deployment of ADR 0001. |
| DEC-2 | One Keycloak realm per customer, on Genie's Keycloak server for a Genie-hosted stack or on a Keycloak in the customer's stack. Amended 2026-09-27: in client-only mode that realm is the customer's own existing realm (ADR 0010). ADR 0002. |
| DEC-3 | A customer's image contains core plus that customer's modules, code and schema alike, and nothing else. Entitlement switches a compiled module on or off (`DEC-33`). ADR 0007 supersedes the one-image rule of ADR 0003. |
| DEC-4 | One public URL per deployment from `PUBLIC_URL`; the application never inspects the hostname. Replaces hostname routing (`DEC-19`, ADR 0007). |
| DEC-5 | Permission model is scoped role-based access: `role`, `role_assignment` with principal and optional scope, one `can()` seam. ADR 0004. |
| DEC-6 | The monorepo is pnpm workspaces with Nx for the task graph, caching, and affected-only runs. Import direction between layers is enforced by the plain oxlint `no-restricted-imports` rule, because Nx's boundary rule runs on oxlint only through an experimental bridge (`tech-stack.md`). |
| DEC-7 | Onboarding is a per-tenant setting, `invite` (default) or `jit`, seeded from `tenant.yaml` and changed later by the tenant administrator. Administrators can always pre-add a person and assign roles before first sign-in. `jit` admits a new person only when their `groups` claim holds a mapped group, so the provider's application assignment and the group-to-role mappings are the two gates, and the deployment guide requires both before the switch. Resolves OPEN-1. Amended 2026-09-27 (per-app access, owner decision): one Keycloak account can reach both Genie Ops Center and genie-studio, so each application decides its own admission; Genie Ops Center admits a new person only when they were pre-added, or, in `jit`, when their `groups` claim holds a directory group mapped to one of its roles. Before this amendment the identity provider was the only gate in `jit` (`../architecture/access-model.md`, "Who may sign in the first time"). |
| DEC-8 | genie-studio and Genie Ops Center are both clients of the same tenant realm, so a customer's people sign in once and offboarding covers both. The realm template creates both clients. genie-studio runs one deployment per tenant, so its single-issuer configuration simply points at that tenant's realm; no change to genie-studio's auth model is needed. The existing `genie-studio` realm is discarded. Resolves OPEN-4. Amended 2026-09-27: in client-only mode both clients are imported into the customer's existing realm instead of a Genie-created one, and the same rule holds there (ADR 0010). Amended 2026-09-27 (per-app access): one account reaching both products does not grant both; each product decides its own admission (`DEC-7`). For genie-studio that work belongs to genie-studio's own repository. |
| DEC-9 | The database migrates when the container starts, under an advisory lock, before the new version serves. A failure keeps the container unhealthy and the previous version serving. Migrations are expand-then-contract, and every release upgrades from the last three. ADR 0005 as amended by ADR 0007. Resolves OPEN-5. Amended 2026-10-20: an upgrade is a short planned maintenance window. A failed migration rolls back its transaction, nothing serves until the operator restarts the previous image by a documented step, and no zero-downtime upgrade is designed. `decision-log.md`, `DEC-33`. |
| DEC-10 | A tenant without an identity provider uses local accounts in its own Keycloak realm. Keycloak is the password store, never Genie. The same OIDC path serves brokered and local tenants; only the realm configuration and the "Add person" behavior differ. Better Auth email and password remains for the break-glass administrator only. |
| DEC-11 | Keycloak authenticates and issues the token; Better Auth owns the application session. Genie Ops Center sends every email it initiates through React Email with tenant branding; Keycloak sends only the credential emails of local-account tenants. Sign-out ends both sessions, except in client-only mode, where it ends the Genie Ops Center session only (ADR 0010). ADR 0006. |
| DEC-12 | Background jobs run on pg-boss in the deployment's database, one worker from the same image. `decision-log.md`. |
| DEC-13 | English only. `next-intl` catalog from Section 0, no translations. `decision-log.md`. |
| DEC-14 | Operators use the `genie-ops` command line shipped inside the image, including `erase` for personal erasure. No operator console. `decision-log.md`. |
| DEC-15 | Break-glass administrator requires an authenticator app. Support impersonation deferred; its column already exists. `decision-log.md`. |
| DEC-16 | Audit kept for the tenant's lifetime, readable with `core:audit:read`. Export and SIEM push later. `decision-log.md`. |
| DEC-17 | Retiring a customer stops the stack and deletes database, realm, and storage after a 90-day hold. Personal erasure, `genie-ops erase`, anonymizes the user row, never deletes it, keeps audit, and deletes the person's record in the tenant realm, never their account at the identity provider. Amended 2026-09-27: in client-only mode Genie deletes neither the realm nor the realm user; the customer's IT does (ADR 0010). Amended 2026-10-20: the contract sets how long the last backup is kept after retirement, with no default. Erasure removes data only, keeps no tombstone, and leaves blocking a future sign-in to the customer's identity provider. `decision-log.md`. |
| DEC-18 | Dev, staging, and production are three Genie-hosted stacks of a demo customer. A customer's UAT is a second stack of that customer. `decision-log.md`. |
| DEC-19 | One public URL per deployment; the reverse proxy owns the certificate. `<slug>.<base>` on Genie's servers, the customer's domain on theirs. `decision-log.md`. |
| DEC-20 | Files: bytes in the tenant database behind a storage interface (`postgres` default, `s3` optional), 15 MB (`DEC-44`), type allow-list, uploads through the application, tokenized downloads, `scan_status` from day one, scanning later. `decision-log.md`. |
| DEC-21 | WCAG 2.1 AA with axe in Playwright. In-app `notification` table from Section 2, inbox screen later, built on that table with SSE live updates (amended 2026-10-05), opened from a header bell (amended 2026-10-20). `decision-log.md`. |
| DEC-22 | All code, core and every module, is owned by Genie Ops Center and lives in the one monorepo. There are no customer repositories. A customer module is a package under `packages/modules/<capability>`, named by capability. New work starts from Nx generators: `module-new` scaffolds a module wired to the contract, `tenant-new` scaffolds a tenant's deployment configuration. Every customer gets its own image built from the same monorepo with a build-time module include list (`DEC-33`); a customer who needs an entirely different experience gets an app under `customers/<slug>/app/` composing the same core, ui, and modules. `customers/<slug>/` holds configuration and composition only, never a module. `decision-log.md`. |
| DEC-23 | No permission bypass except the break-glass account. A tenant administrator holds the `Tenant administrator` system role, which gains each entitled module's admin permission automatically. Initial administrators come from `tenant.yaml` and are activated by first sign-in. When no administrator can sign in any more, the recommended recovery is `genie-ops admin add` on the customer's written request, and the break-glass account is the alternative only when the host command line is out of reach. Administrators land in the workspace; the admin switch shows only to people with a core admin permission. `decision-log.md`. |
| DEC-24 | Break-glass account: created by provisioning, password in the operator's secret store, forced password change and authenticator enrollment on first sign-in, rotated by `genie-ops`, hidden from People, Groups, and Roles, visible in audit only. `decision-log.md`. |
| DEC-25 | Mobile first for every screen including the admin portal; evergreen browsers; no native apps; end-to-end tests at phone and desktop viewports. Amended 2026-10-20: the approvals workflow designer canvas is view-only on a phone, the one exception. `decision-log.md`. |
| DEC-26 | Embedded (iframe) solutions are kept alongside chat solutions. Solutions module, `../modules/solutions/README.md`. |
| DEC-27 | Chat resumes on reopen; Draft, Maintenance, and Down never stream. Solutions module, `../modules/solutions/README.md`. |
| DEC-28 | Schema-driven module configuration with five field kinds and no form engine. Amended 2026-10-20: the approvals module draws designer-built JSON Schema forms with RJSF; developer-written forms stay TanStack Form with zod. `decision-log.md`. |
| DEC-29 | Agent runtime is AI SDK; copilot layer and generative UI deferred behind two seams. Amended 2026-10-20: the boss agent is a core capability that finds module tools only through the capabilities registry, runs every tool as the user behind `can()`, works with zero modules, and is off without a model connection. `decision-log.md`. |
| DEC-30 | Chat endpoint per solution; allowed origins are an operator setting. Solutions module, `../modules/solutions/README.md`. |
| DEC-31 | Platform hardening defaults: logs, error responses, headers, rate limits, backups. Amended 2026-10-20: a managed realm's Keycloak database is backed up and restored with the application database, the backup set covers `s3` file bytes and the identity provider inputs, and the drill restores onto new hosts. `decision-log.md`. |
| DEC-32 | Capabilities considered and not in the foundation. `decision-log.md`. |
| DEC-33 | Every customer's image is built by Genie from the one Dockerfile with `MODULE_INCLUDE`, a generated module registry, and one migration history per module, and delivered as a private image on GitHub Container Registry. A stack is Genie-hosted, customer-hosted and Genie-managed, or customer-hosted and customer-managed. `decision-log.md`. |
| DEC-34 | No code reads the database, settings, branding, entitlements, or files except through one `TenantContext` object built at startup. Enforced by no singleton export, an oxlint import ban, a two-context integration test, and the module generator. The Section 0 stub `can()` grants only `placeholder:read` so that the test has a real read to prove. Keeps a later multi-tenant process a bounded change. Its changing members follow `DEC-46`. `decision-log.md`. |
| DEC-35 | Configuration files hold only values that the generator, `genie-ops setup`, or the image reads. The hosting mode is recorded in the customer's runbook, not in `tenant.yaml`. No value lives in both `tenant.yaml` and `branding.seed.json`: branding values, including the company name, live in the seed only, and a strict zod schema per file, emitted as JSON Schema for editors, rejects a key in the wrong file. `decision-log.md`. |
| DEC-36 | No identity provider kind in `tenant.yaml`, only `local_accounts`. In the fresh realm (the default) the provider is added by `genie-ops idp set` after setup. A customer's existing Keycloak server is supported; a customer can instead choose client-only mode in its existing realm, where `idp set` does not apply (amended 2026-09-27, ADR 0010). `decision-log.md`. |
| DEC-37 | The realm is created with a Keycloak server administrator credential passed to `genie-ops setup` for that one run (`KEYCLOAK_BOOTSTRAP_USER`, `KEYCLOAK_BOOTSTRAP_PASSWORD` in the command's environment), used for the realm step only and never written to `.env`, a file, or a log. Resolves OPEN-6. `decision-log.md`. |
| DEC-38 | The manual steps in the deployment guide are the reference and the fallback. Normal operation will be automated later (`OPEN-7`), and the automation runs the same script, compose file, and `genie-ops` commands with no step of its own. `decision-log.md`. |
| DEC-39 | `scopesFor(user, permission)` in core beside `can()`: returns `all` or the list of scopes, and a module's list query filters on it. One resource through `can()`, a list through `scopesFor()`, no permission logic elsewhere. `decision-log.md`. |
| DEC-40 | Local-account credential emails use Keycloak's built-in templates with the realm display name. No custom theme, no branding values written to the realm. `decision-log.md`. Amends ADR 0006. |
| DEC-41 | An absent `groups` claim keeps the previous `idp` memberships and writes an audit event. A present claim, even an empty one, replaces them. `decision-log.md`. |
| DEC-42 | Cross-module contracts, capability interfaces and shared event schemas, live in `packages/core/contracts`, which imports only zod and types by lint. No separate package until a second consumer needs it. Amended 2026-10-20: a contract enters the folder only between modules any customer may receive; one customer's modules that need a shared contract merge instead (`DEC-33`). `decision-log.md`. |
| DEC-43 | Expand-then-contract is guarded by Squawk and `drizzle-kit check` in the pull request pipeline. A contract migration carries a `squawk-ignore` comment and the reviewer confirms the release gap. No `release` table until a deployment lags. `decision-log.md`. |
| DEC-44 | 15 MB per file on the `postgres` adapter. `FILE_MAX_BYTES` raises it per deployment only when the adapter is `s3`. Blob column on external storage from the first migration. No byte quota. `decision-log.md`. |
| DEC-45 | Every `genie-ops` command writes one `audit_event` row (`ops:<command>`, operating-system user, non-secret arguments, outcome) through one helper. No operator table, no new screen, one filter on the audit reader. `decision-log.md`. |
| DEC-46 | Settings, branding, and entitlements are cached readers on the tenant context that expire after 10 seconds. No `pg_notify`, no Redis, no restart on change. The idle timeout is a per-request check; Better Auth `expiresIn` is a fixed 24 hour cap. `pg_notify` is the revisit path. `decision-log.md`. |
| DEC-47 | A tenant sets one brand color, `primary_color`, with its foreground computed; secondary and accent colors do not exist. Branding gains a font size preset (compact, default, large) and a text color for light surfaces. A second color returns only with a named surface and its own contrast pair. `decision-log.md`. |
| DEC-48 | `can()` and `scopesFor()` read a person's role assignments once per request through a lazy loader built on the request, and answer every later call from it. No cache across requests, so a role granted or revoked applies on the next request. `decision-log.md`. |
| DEC-49 | The page after sign-in is the solutions module's own hub. One workspace navigation entry is marked the landing route and core sends a person there. No core page named Dashboard and no landing-slot contract point exist; a Dashboard with widget slots returns when a second widget has requirements. Closes `OPEN-8`. `decision-log.md`. |
| DEC-50 | A tenant administrator switches a compiled module on or off, sees which groups and people reach it, and places it in a category from a Modules page in the admin portal, behind `core:settings:manage`. Every module with a workspace entry declares `<id>:use` and seeds a `<Display name> user` role. The command line and the page share one procedure. `decision-log.md`. |
| DEC-51 | Navigation categories are a core table with a Categories admin page. A module's navigation entries carry a core category id, `tenant_module.category_id` places a module's static entries, and core renders one tree. The solutions module references the core category by id. `decision-log.md`. |
| DEC-52 | A tenant administrator can add a directory group by typing its exact `groups` claim value and assign roles to it before any member signs in. It shows as "Not seen yet" until a sign-in lists it, and the sync fills that same row. `decision-log.md`. |

Initial tenant branding requires customer identity, locale and time zone, with standard product appearance defaults; application email configuration may follow later. See the [branding seed contract](../architecture/branding-seed.md) for the approved rules and their DEC-35 amendment.

## Open decisions

Ids are stable. A resolved item is removed here and named in the Decided table. Module-level open decisions live in that module's `README.md` under `../modules/`.

| Id | Question | Default until decided |
| --- | --- | --- |
| OPEN-7 | How are setup and upgrade automated for normal operation, and with which tool? Decided after the platform is built and ready for its first deployment (`DEC-38`). | The manual steps in `../runbooks/deployment.md`. |
| OPEN-9 | What are the branding explicit-null rules, default materialization and later name-change behavior, exact asset fallbacks and application-email readiness requirements? | Closed 2026-10-19: omission only, defaults computed at render time, neutral fallbacks, email ready when the mail transport is configured. See [branding seed contract](../architecture/branding-seed.md#decided-2026-10-19-closes-open-9). |
| OPEN-10 | How does a machine caller (not a browser session) authenticate to the REST API described by the checked-in OpenAPI document? | No public REST endpoint ships until it closes ([ADR 0011](../adr/0011-replace-trpc-with-orpc.md)). |
| OPEN-11 | How does a module publish a named dataset (fields, filters, and a description for the agent) that the analytics module and the boss agent can read for one person, filtered by `scopesFor()`, without reading the module's tables? A capability interface in `packages/core/contracts`, a generic query shape, and a limit on rows and cost per request are the candidates. | Analytics does not start. The boss agent reads module data only through read tools that each module writes by hand (`DEC-29`). |
| OPEN-12 | The boss agent of `DEC-29`: (a) model hosting per customer, which providers and endpoints a deployment may name, and how the model connection setting holds its key; (b) which libraries generate Word and PowerPoint files, and whether they run in the app process or the job worker; (c) which write actions an agent may propose, and how the user approves one; (d) what the audit event of a tool call stores, since storing returned records copies data that the user may later lose access to. Note 2026-10-20 (owner): the provider in (a) is decided when the agent work starts. | The agent is off. No model connection setting, document library, or agent tool ships until each part closes in the agent's specification. |
