# Decision Log: Questions and Answers

Status: 2026-09-16. Questions that had no owner answer and were decided by default, kept here with their reasoning so they can be revisited. Each entry says what is designed in from the start, what is implemented and when, and what would trigger a revisit. An entry that changes a screen also carries a `Design files affected` line that names the files under `../design/` that must change on the next handover. The Decided table in `vision.md` indexes them as `DEC-n`.

## DEC-12. Background jobs

Question: reminders, group syncs, AI extraction, migration retries, and email retries all need a scheduler and a queue, and the tech stack had none.

Decision: pg-boss, a Postgres-backed job queue, in the deployment's own database in its own schema. No new infrastructure, jobs survive restarts, and one worker process from the same image handles them (ADR 0007).

Designed in: Section 1. Implemented: Section 1 item 9, because the event bus of item 9a runs its slow handlers on it. Revisit if a customer's job volume needs a dedicated broker.

## DEC-13. Languages

Question: which languages must the interface support?

Decision: English only. `next-intl` is installed from Section 0 so every user-facing string lives in one message catalog, but no translation work is done. Retrofitting a catalog later costs far more than carrying an English-only one now.

Designed in: Section 0. Implemented: Section 0 (catalog), translations never until a customer requires one. Revisit when a customer contract names a second language.

## DEC-14. Operator tooling

Question: do operators get a console or a command line?

Decision: a command-line tool, `genie-ops`, shipped inside the image and run with `docker exec` or as a second entrypoint, so a customer-managed deployment has it without a separate install (ADR 0007). Commands: set up the deployment, set the identity provider, add an administrator, enable or disable a module, rotate the break-glass account, migrate, retire. No operator console.

Designed in: Section 1. Implemented: Section 1. Revisit when the number of deployments makes the command line error-prone, or when a non-engineer must operate it.

## DEC-15. Break-glass administrator and support access

Question: the break-glass account signs in with a password only, and support access to a tenant was undefined.

Decision: the break-glass account requires an authenticator app (Better Auth two-factor plugin) and is reachable only at `/admin/login`. It exists for one problem: nobody can sign in through the identity provider, because the provider is down, misconfigured, or the realm is broken, and it is the only account that signs in without the provider. Administrator turnover is not its job; that is `genie-ops admin add` (`DEC-23`). The deployment guide holds a table of recovery scenarios with one action each. Support impersonation is not built in the foundation; the `session.impersonated_by` column already exists, so a later impersonation feature needs no migration and must record the tenant administrator's consent in the audit log.

Designed in: Section 2. Implemented: second factor in Section 2; impersonation later, only when support load demands it. Revisit at the first customer security review.

## DEC-16. Audit retention, export, and reader

Question: audit exists but had no retention, export, or reader permission.

Decision: audit events are kept for the tenant's lifetime and never edited. A tenant administrator with `core:audit:read` can read and filter them in the admin portal. CSV export and a SIEM push endpoint come later.

Designed in: Section 2 (`core:audit:read`, append-only table). Implemented: reader in Section 2; CSV export and SIEM push after the core sections. Revisit when a customer names a retention period shorter than lifetime or a specific SIEM.

## DEC-17. Tenant offboarding and personal-data erasure

Question: retiring a tenant and deleting a person's data had no path.

Decision: retiring a customer stops the stack and keeps its last backup, database, realm, and bucket for 90 days; after the hold, `genie-ops retire --confirm` deletes them, unless a hold is placed. A customer-managed deployment retires itself; Genie deletes only what Genie holds, such as the image and the realm on Genie's Keycloak server (ADR 0007). Erasing a person anonymizes the `user` row (name and email replaced, accounts and sessions deleted) and keeps their audit events under the anonymized id. Amended 2026-09-17: the marker is `user.erased_at`, and `data-shape.md` names the replaced fields.

Designed in: Section 1. Implemented: Section 5. Revisit when a customer contract names a different hold period.

## DEC-18. Environments and testing tenants

Question: are there dev, staging, and production, and do customers get a UAT environment?

Decision: Genie runs a demo customer as three Genie-hosted stacks: dev, staging, and production. A customer's UAT is a second stack of that customer, with its own database and realm, on Genie's staging servers or on the customer's own, set up by the same commands. No special UAT mode in code (ADR 0007).

Designed in: Section 1. Implemented: Section 5. Revisit never; a second stack is the only mechanism.

## DEC-19. Hostnames and certificates

Question: base domain, certificate, and customer-owned domains were undecided.

Decision: every deployment has one public URL in `PUBLIC_URL`, and the reverse proxy in front of the stack owns the certificate. A Genie-hosted stack gets `<slug>.<base domain>` and Coolify's automatic certificate. A customer-hosted stack uses the customer's own domain and the customer's certificate. The application reads the URL and never inspects the hostname (ADR 0007).

Designed in: Section 0. Implemented: Section 0. Revisit never; a domain is a proxy setting.

## DEC-20. File storage and policy

Question: uploads had no size limit, type list, or malware scan, and there is no object storage service and no intent to pay for one.

Decision: file bytes are stored in the tenant's own Postgres database, in a `file_blob` table beside the `file` metadata row, behind a `FileStorage` interface with two adapters: `postgres` (default) and `s3`. The adapter is chosen per deployment in the environment (`FILE_STORAGE_ADAPTER`), so a customer who wants the application's files in their own bucket configures `s3` with their credentials while other customers stay on the database. This is the application's own file store. A module that reads or writes a customer's external system (a file share, SharePoint, a bucket that is not the application's store) is an integration owned by that module; core provides only the `tenant_integration` record that holds its non-secret configuration and a secret reference. Uploads go through the application in one request; downloads are app-issued links with a short-lived token, checked against `can()` on the owning record. 15 MB per file on the `postgres` adapter, raised per deployment through `FILE_MAX_BYTES` only when the adapter is `s3` (`DEC-44`), an allow-list of document and image types, SVG sanitized on upload. The `file` row carries `scan_status` (`pending`, `clean`, `infected`, `skipped`) from the first migration; until a scanner exists every file is `skipped`. ClamAV scanning is added later as a pg-boss job enqueued after the upload request, and it flips the value without a migration.

Why Postgres: isolation and backups already exist per database, logos and favicons are kilobytes, and document volume is low. The ceiling is memory per upload and backup size, which the 15 MB limit bounds and the `s3` adapter lifts (`DEC-44`).

Change of adapter after go-live: the adapter is chosen in `.env` before setup and stays for the life of the deployment. A later switch does not move bytes on its own, so it needs `genie-ops files migrate`, a command that copies every blob from the old adapter to the new one and then switches `FILE_STORAGE_ADAPTER`. The command is not built until a customer needs it, but the path stays open, and no change may close it. Two rules keep it open: every byte read or write goes through `FileStorage` keyed by the `file` id and nothing else touches `file_blob` or the bucket, and the `file` row never records where its bytes live, so a copy plus an adapter switch is the whole migration.

The object-store adapter wraps a FlyDrive disk rather than the S3 client directly, so S3 and every S3-compatible service, Google Cloud Storage, and Azure Blob Storage (community driver) cost one adapter. `FILE_STORAGE_ADAPTER` then takes `postgres`, `s3`, `gcs`, or `azure`, each with its own variables in the environment contract, and a store is added when a customer needs it. No library stores bytes in a Postgres table, so the `postgres` adapter and the `FileStorage` interface stay our own.

Amended 2026-09-17, SVG sanitizing: the phrase "SVG sanitized on upload" above named no library and no rule. A logo SVG is served from the deployment's own origin, so an unsanitized file is a stored script on a trusted origin. Every uploaded `image/svg+xml` file passes DOMPurify on jsdom in core, in the upload request, before the bytes reach `FileStorage`. The sanitizer runs with the SVG profile only (`USE_PROFILES: { svg: true, svgFilters: true }`), forbids `foreignObject` and `style`, and allows only references inside the file, so it strips scripts, event handler attributes, external references (`href`, `xlink:href`, and `url()` to another origin), and foreign objects. A file that is empty after sanitizing is refused. Both libraries are in `tech-stack.md`.

Designed in: Section 1. Implemented: `postgres` adapter, limits, sanitizer, and tokenized downloads in Section 1; `s3` adapter and scanning after the core sections. Revisit when a tenant's file bytes pass a few gigabytes or backups slow down.

## DEC-21. Accessibility and in-app notifications

Question: the accessibility target was "basics", and modules will want an inbox rather than email only.

Decision: WCAG 2.1 AA is the target, checked automatically with axe in the Playwright suite and manually per section design. A `notification` table exists in core from Section 2 and is written by the same events that send email; the inbox screen in the shell is built later.

Designed in: Section 3 (the inbox screen is designed together with the account page). Implemented: axe checks in Section 3; notification table in Section 2, item 8, where the first event writes to it; inbox screen after the core sections. Revisit when the first module needs the inbox.

## DEC-22. Ownership, repositories, and the new-customer workflow

Question: when a new customer arrives, is a new repository scaffolded for them, and who owns customer-specific module code?

Decision: everything is owned by Genie Ops Center, core and every module alike, and everything lives in the one monorepo. There are no customer repositories. A customer-specific module is a package under `packages/modules/<capability>`, named by what it does, never by the customer. The new-customer workflow is: `nx g @genie/tenant:new <slug>` to scaffold `customers/<slug>/deploy/` with the tenant's configuration and provisioning inputs, `nx g @genie/module:new <capability>` for each module the customer needs that does not exist, then one entitlement per module. A generic module, when the team has the experience to design one, is the same kind of package and becomes shared by entitling a second tenant.

Why not a repository per customer: core would become a published package, and every core fix would be published once and then bumped, tested, built, and deployed once per customer repository, with customers drifting onto different core versions. One repository means one fix, one build per customer from the same commit, and every customer on the same core the same day.

Images: every customer gets its own image built from the same monorepo and the same Dockerfile with a build-time module include list, so two customers' images differ only in which modules are compiled in (`DEC-33`, ADR 0007). Still one repository, still owned by Genie Ops Center.

Customer folders: `customers/<slug>/` holds that customer's deployment configuration and, if needed, their custom application. It never holds a module; modules are capabilities under `packages/modules/` given by entitlement, so they can be given to a second customer without moving.

Full customization: a customer whose experience the standard shell cannot express gets an application under `customers/<slug>/app/` in the same monorepo, composing `packages/core` and `packages/ui` with the modules it needs and shipping as that customer's image. Core must therefore stay a library that any app can assemble; `apps/genie` is the standard composition, not the product. See `../architecture/repository-layout.md`, level 8.

Designed in: Section 0 (generators, include list). Implemented: Section 0 (`DEC-33`). Revisit never, unless ownership terms change in a contract.

## DEC-23. What an administrator is, and how the first one gets in

Question: does an administrator bypass permission checks, and how does a customer's first administrator receive rights?

Decision: nobody bypasses `can()` except the break-glass account. A tenant administrator is a person holding the `Tenant administrator` system role, which carries the six core permissions. When a module entitlement is enabled, that module's admin permission is appended to the role, so an administrator always sees every entitled module's admin screens. Member-facing use of a module's records is still a grant, so the Access overview stays truthful. `customers/<slug>/deploy/tenant.yaml` lists the initial administrator emails; provisioning pre-adds them as pending people in a seeded local group `Genie Administrators` that holds the role, and their first sign-in through the identity provider activates them. Administrators land in the workspace after sign-in; the switch to the admin portal appears in the user menu only for a person holding a core admin permission.

Administrator recovery: the screens protect the last holder of `Tenant administrator` from removal, but that protection does nothing when that person left the company or was disabled at the identity provider, because they can no longer sign in. The recommended path is `genie-ops admin add <email>`, run on the host by whoever operates the stack in the chosen hosting mode, on the customer's written request. The command pre-adds the person as pending in `Genie Administrators`, or adds an existing person to that group, and the next sign-in through the identity provider gives them the role. The alternative is the break-glass account: its holder signs in at `/admin/login` and gives the role in People. Use the alternative only when the host command line is out of reach, because a break-glass session is unchecked for everything it touches (`DEC-15`, `DEC-24`), while the command does one scoped action. Both paths write an audit event that names the actor and the new administrator. The written request exists because in a Genie-managed mode Genie's operator can otherwise appoint an administrator inside a customer's deployment without the customer's knowledge. In a customer-managed mode the customer's platform team holds the host and the break-glass password, so both paths are theirs. The holder of the break-glass password leaving is a different problem with its own command, `genie-ops break-glass rotate` (`DEC-24`).

Designed in: Sections 1 and 2. Implemented: Sections 1 and 2. Revisit if a customer requires a separation-of-duties model where no single role may hold all core permissions.

## DEC-24. Break-glass account lifecycle

Question: how is the break-glass account created, secured, and shown?

Decision: provisioning creates it from an operator-supplied email in `tenant.yaml`, generates the password once, and writes it to the operator's secret store; it is never given to the customer. First sign-in at `/admin/login` forces a password change and authenticator-app enrollment. Until both are done the session is limited: `can()` and every router refuse, and only the change-password and enrollment endpoints answer. Completing them revokes the account's other sessions. `genie-ops break-glass rotate` rotates the password, clears the authenticator, and deletes the account's sessions in one transaction. Password rule, shared by the meter and the server: at least 14 characters, three of four character classes (upper, lower, digit, symbol), not the provisioning password, not the email. The account carries `is_break_glass = true`, is hidden from People, Groups, and Roles, cannot be disabled or removed from the admin portal, and appears only in the audit log. It has its own account page variant: change password (current password required), re-enroll authenticator, and sessions. It is the only principal that bypasses `can()` once its session is no longer limited.

Designed in: Section 1. Implemented: Sections 1 and 2. Revisit at the first customer security review.

## DEC-25. Mobile first

Question: which devices and browsers are in scope?

Decision: every screen, including the admin portal, is designed mobile first: the phone layout is designed before the desktop layout, tables become card lists on small screens, side inspectors become full-height sheets, and no action is desktop-only. Evergreen browsers only (current Chrome, Edge, Firefox, Safari). No native apps. The Playwright suite runs each end-to-end test at a phone viewport and a desktop viewport.

Designed in: Section 3 and every module phase. Implemented: from Section 0 (test viewports) onward. Revisit never; a desktop-only screen is a defect.

## DEC-26. Embedded solutions are kept

Solutions module decision. The full record is in `../modules/solutions/README.md` under Decisions. The number is reserved here so references stay valid.

## DEC-27. Chat conversation and status semantics

Solutions module decision. The full record is in `../modules/solutions/README.md` under Decisions. The number is reserved here so references stay valid.

## DEC-28. Schema-driven module configuration form

Question: the Tenant Settings page renders one configuration card per entitled module without core knowing any module. Which library renders a form from a schema, given the stack (React 19, TanStack Form, zod 4, shadcn on Base UI)?

Decision: no form-engine library. Each module declares `configSchema` as a zod object in its contract. The same zod schema validates the tRPC save procedure. Core converts it with zod 4's built-in `z.toJSONSchema()` and a small `ConfigForm` component in `packages/ui` renders the result on TanStack Form over the Base UI controls. `ConfigForm` supports exactly five field kinds: string, number, boolean (switch), enum (select), and string list, plus title, description, and constraints (min, max, pattern, item limit) from the schema. A module whose schema uses any other shape fails its contract test at build time. A module that needs more ships its own settings page through the pages slot; `ConfigForm` never grows into a form engine.

Why not react-jsonschema-form, AutoForm, FormEngine, or a generative UI renderer: every candidate brings a second form state and validator beside TanStack Form and zod, and none targets Base UI, so a theme of about ten widgets would be written anyway. Five field kinds on the existing stack is smaller than that theme. AutoForm's shadcn package is unmaintained (2024, no React 19); FormEngine adds MobX and React Suite; json-render, OpenUI, A2UI, and CopilotKit solve model-generated UI, not developer-declared settings.

Designed in: Section 3 (Tenant Settings, with a placeholder module section that shows all five kinds; no shipped module has configuration yet, see DEC-30). Implemented: Section 3. Revisit when a real module needs a sixth kind twice; then weigh one more kind against adopting react-jsonschema-form with a Base UI theme.

## DEC-29. Agent runtime and generative UI, deferred

Question: the product owner wants Genie Ops Center to be ready for model-generated UI and for agents that act inside the application (copilot pattern). Which framework, and when?

Decision: deferred. AI SDK, already in the stack, is the agent runtime: agents that Genie Ops Center itself runs live in Next.js route handlers, tool calls and results stream as typed message parts, approval steps are one part type, and MCP is available as a client. Two seams are reserved so a later copilot layer or generative UI renderer is a bounded change: every agent conversation renders through one message-part renderer, and the module contract's capabilities registry is the only catalog of actions an agent may call, each behind `can()`. A model-generated UI block, when needed, is a leaf component with its own component catalog and no access to application state.

Candidates checked on 2026-09-16, all pre-1.0 or fast-moving: json-render (Vercel, pins React 19, Tailwind 4, zod 4), OpenUI core (`lang-core` and `react-lang` only, streaming-first, own components as catalog; its `react-ui` pins zustand 4 and Radix), A2UI (pins zod 3), CopilotKit (AG-UI native since v1.50, GraphQL gone from the request path but still in the dependency tree, runtime pins `ai` 6 and zod 3, headless hooks available). Choose when the first bot returns UI or the first copilot screen is designed.

Designed in: none yet. Implemented: none. Revisit when a customer module needs an in-app copilot or a bot returns structured UI.

## DEC-30. Chat endpoint is a per-solution setting

Solutions module decision. The full record is in `../modules/solutions/README.md` under Decisions. The platform side, the operator variable `GENIE_CHAT_API_ALLOWED_ORIGINS`, stays in `../architecture/environment-contract.md`.

## DEC-31. Platform hardening defaults

Question: logging, error responses, security headers, rate limits, and backups had no stated rule, so each would be decided at implementation time by whoever got there first.

Decision: pino JSON logs with request, tenant, and user ids and a redaction list; API errors return a stable code and a safe message, never upstream or database text. Security headers on every response: nonce-based content security policy, `frame-ancestors 'none'`, `frame-src` from the origins modules contribute through the contract, HSTS with preload, strict referrer policy, nosniff, minimal permissions policy. Rate limits: Keycloak handles sign-in brute force per realm; Genie Ops Center limits add person, resend set-password, and break-glass sign-in per tenant and audits each refusal. Backups: nightly logical backup of every deployment database, 30 days retention, quarterly restore drill on staging; default recovery point 24 hours and recovery time 8 hours. The full variable list is `../architecture/environment-contract.md`.

Designed in: none (no screens). Implemented: Section 0 (logging, headers), Section 2 (rate limits), Section 5 (backups). Revisit when a customer contract names recovery targets or a compliance standard.

## DEC-32. Capabilities considered and not in the foundation

Question: several capabilities were weighed during planning and are neither built nor designed; without a record they return as questions.

Decision, one line each:

- One administrator tier. There is no owner role above `Tenant administrator`; separation of duties, if a customer requires it, is a set of narrower custom roles (`DEC-23`).
- No second factor in Genie Ops Center for members. A brokered tenant's identity provider enforces it; a local-account realm may require an authenticator app through the realm template. Only the break-glass account enrolls an authenticator in Genie Ops Center (`DEC-15`, `DEC-24`).
- No remembered devices or device trust; the new-device sign-in email is the only device signal.
- No step-up re-authentication for sensitive actions; sessions are short and idle-bound instead (`DEC-11`).
- No branded Keycloak email theme; local-account tenants get Keycloak's built-in credential emails (`DEC-40`).
- An absent groups claim keeps the previous memberships and writes an audit event; only a present claim replaces them (`DEC-41`).
- Cross-module contracts, both capability interfaces and shared event schemas, live in `packages/core/contracts`, which imports only zod and types (`DEC-42`).
- Migration safety is a pull request lint: Squawk over changed migration files plus `drizzle-kit check`. No runtime version check (`DEC-43`).
- Files are 15 MB at most on the `postgres` adapter; `FILE_MAX_BYTES` raises the limit only when the adapter is `s3` (`DEC-44`).
- Every `genie-ops` command writes one `audit_event` row with the operating-system user and its non-secret arguments. No operator table (`DEC-45`).
- No avatar upload. People show initials; `user.image` stays reserved for a token-supplied picture.
- Email is not self-service. A brokered account's email comes from the token; a local account's email is changed by an administrator, and the change is audited.
- Solutions module defaults (attachments, solution types, theme presets, transcript on reopen) are listed in `../modules/solutions/README.md` under Decisions.
- Settings, branding, and entitlements are read through cached readers that expire after 10 seconds. No `pg_notify`, no Redis, no restart on change (`DEC-46`).
- Better Auth `expiresIn` is a fixed 24 hour absolute cap. The idle timeout is the application's own per-request check (`DEC-46`).

Designed in: none. Implemented: none. Revisit each when a customer names it; the list is the place to add the date and the tenant.

## DEC-33. The per-customer image and how a customer receives it

Question: how does a customer run Genie Ops Center without other customers' modules on its servers, and who operates it?

Decision: every customer runs its own deployment (ADR 0007) from its own image, which contains core plus that customer's modules and nothing else. Excluded modules are absent from the image: not compiled, not in the client bundle, and not in the migration history. This replaces DEC-3's statement that module code confidentiality is not a requirement. Another customer's module code and table shape never reach a customer's servers.

How the image is built: one Dockerfile in the repository, with `MODULE_INCLUDE` as a build argument. The module registry file `apps/genie/src/modules.ts` is generated at build time from that list, so an excluded module has no import anywhere in the build. The build is a script in the repository, `scripts/build-customer-image.sh <slug> <version>`, that a developer runs by hand; Coolify or a GitHub Actions job runs the same script. The customer never builds anything and never receives source. The image holds no credential and no secret: `MODULE_INCLUDE` is the only build argument, and every secret enters at run time from `.env` (`../architecture/environment-contract.md`), because an image is passed around and stored in a registry, and a build argument stays readable in its history.

How the image is delivered: one private image per customer on GitHub Container Registry, `ghcr.io/<org>/genie-<slug>:<version>`. The customer receives a token that can only read that one image. A site without internet access receives the image as a file produced by `docker save` and attached to a private release, and loads it with `docker load`. GitHub charges nothing for container storage and bandwidth as of 2026-09-17 and has promised 30 days notice before that changes; the release file is the fallback if it does.

How the image is run: one stack per customer from the compose file or Helm values that `nx g @genie/tenant:new <slug>` generates into `customers/<slug>/deploy/` from the template in `deploy/stack/`. The stack is the application, the job worker from the same image, and Keycloak, unless the customer already runs Keycloak. Postgres and SMTP come from the host: Genie's servers for a Genie-hosted stack, the customer's for a customer-hosted one. `genie-ops` is inside the image and runs with `docker exec` or as a second entrypoint, so no separate tool is installed. A migration failure keeps the container unhealthy and the previous version serving.

Where a stack runs and who operates it, chosen per customer in the contract and recorded in the customer's runbook, never in `tenant.yaml` (`DEC-35`):

- Genie-hosted. The stack runs on Genie's Coolify servers. Genie operates it and holds the break-glass secret.
- Customer-hosted, Genie-managed. The stack runs in the customer's infrastructure. The customer's host is added to Genie's Coolify as a remote server over SSH, and upgrades, restarts, and logs go through the same panel as every other stack. Genie holds the break-glass secret. This is the mode for the first customer.
- Customer-hosted, customer-managed. The customer pulls the image, runs it, upgrades it by pulling the next tag, and holds the break-glass secret. Genie has no access. Support is by runbook and release notes.

The hosting mode changes no code and no command. It changes only who runs the host, who upgrades, who holds the break-glass secret, who backs up, and whether Genie's Coolify reaches the host.

Migration histories: every module owns its own drizzle-kit migration folder and its own migrations table, `__drizzle_migrations_<module>`, and core owns another. The migrator applies core first and then each included module in registry order, all under one advisory lock. An excluded module leaves no table. A module added to a customer's include list later receives its history on the next start, so adding a module needs no special step. Two modules never reference each other's tables, which ADR 0003 already requires, so the order among modules is not load-bearing.

Not supported: customer developers writing modules against core. That is the one case that forces core to become a versioned package, at the cost recorded in DEC-22. Revisit when a customer asks for it in a contract.

Why not one image for everyone: the customer must not hold another customer's code or table shapes on its servers, and a compiled image is readable. Why not a source drop: the customer can then build and copy the product, and holds core source that Genie owns. Why not a repository per customer: DEC-22.

Designed in: Section 0. Implemented: the generated registry, the build argument, the build script, and per-module migration histories in Section 0, because the first customer is customer-hosted; the registry push, the token, and the runbooks in Section 5. Revisit if GitHub starts charging for private container images, or if a customer asks to write modules.

## DEC-34. The tenant context seam

Question: a deployment serves one customer today (ADR 0007), so why not import one global database connection everywhere?

Decision: no code reads the database, the settings, the branding, the entitlements, or the file store except through one `TenantContext` object. The app builds it once at startup from the environment and passes it into the tRPC context, the job worker, and every page. Its pool, file store, and environment values are fixed for the process; its settings, branding, and entitlements are cached readers that follow `DEC-46`. A router procedure reads `ctx.tenant.db`, never a module-level `db` import. The reason is the day many customers share one process again, if compute cost at a hundred stacks ever demands it: that day changes only how the context is built, per request from a lookup instead of once from the environment, and no procedure, job, or page changes.

Enforcement, all mechanical:

1. Core exports no `db`, `settings`, `branding`, or `storage` singleton. It exports `createTenantContext()` and the `TenantContext` type, and only the app's entrypoints call the function.
2. The oxlint `no-restricted-imports` configuration that enforces the layer direction also bans `pg`, `drizzle-orm/node-postgres`, and core's internal connection module from every module and app file.
3. One integration test in Section 0 builds two tenant contexts against two Testcontainers databases in one process and runs the placeholder module's router through each; it fails if any code path reaches the wrong database. It is the standing isolation test and never gets skipped.
4. `nx g @genie/module:new` scaffolds every procedure and job with `ctx.tenant` already in the signature.

Amended 2026-09-17, the stub `can()` and the isolation test: Section 0 ships a stub `can()` before sign-in exists, and a stub that refuses every call would leave the placeholder router without a path to any database, so item 3 would prove nothing. The stub refuses every permission except `placeholder.read`, which the placeholder module declares like any other permission key and which the stub grants to every request. The placeholder's read procedure calls `can()` for it and then reads through `ctx.tenant.db`, so the isolation test exercises the seam and the pool on one code path. No test-only principal exists and no procedure reads without a permission, because both are a bypass by another name. Section 2 item 6 replaces the stub with the real evaluator, and from then on `placeholder.read` is granted only through a role like every other key.

Designed in: Section 0. Implemented: Section 0. Revisit never; the seam costs nothing and is the only thing that keeps the multi-tenant door open.

## DEC-35. Configuration holds only values that something reads

Question: does the hosting mode (Genie-hosted, customer-hosted and Genie-managed, customer-hosted and customer-managed) belong in `tenant.yaml`?

Decision: no. Every field in `tenant.yaml`, in the compose file, and in `.env` is read by the generator, by `genie-ops setup`, or by the image. A value that no code reads is not configuration and is not written there, because a reader assumes that a field in a configuration file does something. The hosting mode is such a value: it changes no code and no command (`DEC-33`), only who operates the stack. It is recorded in the customer's runbook under `docs/runbooks/`, next to the host, the Postgres, the SMTP, and the Keycloak the customer supplied. The same rule removes any "comment only" key from the stack template, and it forbids a second copy of an environment value: the public URL and the file storage adapter live in `.env` only, because the image and `genie-ops setup` read them from the environment and a copy in `tenant.yaml` can drift from the copy that runs.

Amended 2026-09-17, one owner per value: no value ever lives in both `tenant.yaml` and `branding.seed.json`. `branding.seed.json` holds exactly the columns of `tenant_branding`, so the company name and the product display name live there only, and `genie-ops setup` reads the company name from that file for the realm display name (`DEC-40`). `tenant.yaml` holds only what is not branding: the module list, the onboarding mode, `local_accounts`, the first administrators, and the break-glass email. The slug is the folder name under `customers/` and the realm name is derived from the slug by the generator, so neither is a field. Both files have a schema: two strict zod schemas in `packages/core/src/lib/tenant-config/`, one per file, that reject an unknown key, so a value put in the wrong file fails the generator and `genie-ops setup` alike. `nx run core:schemas` writes the JSON Schema of each through `z.toJSONSchema()` into `deploy/schemas/`, committed, and CI fails when the committed files are stale. `tenant.yaml` starts with a `yaml-language-server` schema comment and `branding.seed.json` carries a `$schema` key, which the loader strips before parsing, so an editor validates both files as they are typed.

Trade-off: an operator who opens `customers/<slug>/deploy/` does not see the hosting mode there and must open the runbook. In return no field ever lies about its effect, and the generator and setup command have no keys to ignore.

Designed in: now. Implemented: Section 1, when the generator writes `tenant.yaml`. Revisit if a command ever needs to branch on the hosting mode, which would also break the hosting-agnostic rule and needs its own decision.

## DEC-36. No identity provider kind in configuration, and no reuse of an existing realm

Question: `tenant.yaml` carried an identity provider kind (OIDC, SAML, LDAP, or local). Does anything read it, and what happens when a customer already has a Keycloak realm?

Decision: the kind is dropped. The realm template has two variants only, brokered and local accounts (`DEC-10`), so `tenant.yaml` carries one boolean, `local_accounts`. `genie-ops setup` reads it to pick the template variant and to seed `tenant_settings.local_accounts_enabled`. The protocol of a brokered provider is an argument of `genie-ops idp set`, run after setup, with the issuer and the client secret taken from the environment at that moment and never stored in `customers/<slug>/`. A kind in `tenant.yaml` would be a note (`DEC-35`).

A customer who already runs a Keycloak server is supported: `KEYCLOAK_URL` points at it and setup creates a fresh Genie realm there from the template. A customer who wants Genie to use an existing realm, with its own users and clients, is not supported. Reusing a realm means that setup skips the template, and every guarantee the template gives (the two clients, the admin service client with rights in this realm only, the groups mapper, PKCE, trust email, brute-force protection) becomes a checklist that the customer must meet and the runbook must check by hand. The fresh realm brokers the customer's existing provider instead, so their people still sign in once.

Trade-off: a customer with a realm they like gets a second realm on their server, and their people appear in two realms. In return setup stays one command with one result, and no customer-specific realm ever breaks an upgrade.

Designed in: Section 1. Implemented: Section 1. Revisit when a contract requires reuse of an existing realm; the change is a `--existing-realm` flag on setup plus the checklist above, and it needs its own decision.

## DEC-37. The credential that creates the realm is passed to setup for one run

Question: `genie-ops setup` creates the realm, but `KEYCLOAK_ADMIN_CLIENT_ID` has rights in that realm only, so it cannot create it. Where does the credential that creates the realm come from? Was OPEN-6.

Decision: the operator passes a Keycloak server administrator credential to the setup command for that one run, as `KEYCLOAK_BOOTSTRAP_USER` and `KEYCLOAK_BOOTSTRAP_PASSWORD` in the environment of the command itself, for example with `docker compose exec -e`. Setup uses it for one step only: create the realm from the template and create the `genie-admin` client with the secret that `.env` already holds in `KEYCLOAK_ADMIN_CLIENT_SECRET`. Every later step uses the realm-scoped client. The bootstrap credential is never written to `.env`, to any file in `customers/<slug>/`, or to a log. Because setup is resumable (`setup_step`), a rerun after the realm step does not need it, and setup refuses the realm step with a clear message when it is absent. A customer who supplies their own Keycloak server types the credential themselves, so Genie never holds it.

Alternatives: a server-wide administrator client in `.env` is rejected, because every deployment would then hold at rest a credential with rights over every realm on that server. Realm import through Keycloak's own import, with setup only configuring, keeps the server credential away from Genie code, but it splits setup into two tools and moves the merge of the template with `realm.overrides.json` outside the command.

Trade-off: whoever runs setup must hold a server administrator credential at that moment, and the two bootstrap variables are absent from `.env.example`, so the deployment guide is the only place that names them. In return the image and the deployment hold no credential beyond the realm, and setup stays one command.

Designed in: Section 1. Implemented: Section 1. Revisit if setup is ever run by an automated pipeline rather than a person; the change is a short-lived token from the pipeline's secret store passed the same way.

## DEC-38. The manual steps are the reference and the fallback; automation comes later

Question: the deployment guide sets up and upgrades a customer by hand with the build script, `docker compose`, and `genie-ops`. Is that the normal way, or a fallback?

Decision: the manual steps are the reference and the fallback. Normal operation will be automated, but how is decided after the platform is built and ready for deployment (`OPEN-7`), because the right tool depends on what exists then and on who in the team operates the stacks. Whatever automation is chosen runs the same build script, the same compose file, and the same `genie-ops` commands as the guide, and adds no step of its own, so the manual steps stay complete and a person can always fall back to them. No automation-only path may exist that the guide cannot reproduce by hand.

Trade-off: until automation exists, every setup and upgrade is a person's time, which is acceptable up to about twenty customers (ADR 0007). In return the guide is written once, is true in every hosting mode, and the later automation is a thin layer that can be replaced.

Designed in: Section 1. Implemented: Section 5. Revisit as `OPEN-7` when the platform is ready for its first deployment.

## DEC-39. `scopesFor()` beside `can()` for list queries

Question: `can(user, permission, resource?)` answers one resource, and the module contract forbids a permission check anywhere else. How does a list screen show only the records a person may reach when access is granted per record, for example a chat user who holds `solutions:use` on three solutions?

Decision: core exports a second function in the same access module, `scopesFor(user, permission)`. It reads the same assignments as `can()` and returns either `all`, when any matching assignment has a null scope, or the list of scopes as type and id pairs. A module's list procedure calls it before the query and turns the scopes into its own `WHERE` clause: its record id for scopes of its own type, and its parent columns for scopes of a declared parent type. Amended 2026-09-17: the parent types are declared on the record type in the module contract, and the record type's resolver returns the parents of one record as type and id pairs, so `can()` resolves the resource once and matches it against its own scope and each parent, and a module's list query knows which scope types to map onto which columns. Core cannot build that clause itself, because scopes reference records by type and id and core has no foreign key into module tables. The rule stays one seam: a module checks one resource only through `can()` and lists only what `scopesFor()` returns. Both functions live in core, share one loader per request (`DEC-48`), and are tested together, so they cannot disagree.

Why not per-row filtering: fetching a page and then dropping rows that fail `can()` returns short pages and a wrong total. Why not a scope query inside the module: the contract bans it, and every module would repeat the assignment join. Why not Postgres row-level security: it needs a per-user session variable set on every query and a policy per module table, for a filter that one `IN` clause already gives.

Trade-off: a second function that must stay consistent with `can()`, and a long `IN` list for a person with thousands of record grants. Neither is a problem at our customer scale. If it becomes one, `scopesFor()` returns a subquery on `role_assignment` instead of a list, and no module changes.

Designed in: Section 1. Implemented: Section 2 item 6, first used by the solutions workspace list in Section 4. Revisit if a module needs a filter that scopes cannot express, for example row ownership by attribute.

## DEC-40. Keycloak's built-in email templates for local-account tenants

Question: `DEC-11` and ADR 0006 planned one custom Keycloak email theme that reads six branding values from realm attributes, so the three credential emails of a local-account tenant (set password, reset password, verify email) match the tenant's branding. The Keycloak email template context is a fixed attribute map with no realm object, so a theme cannot read realm attributes at all. What replaces the plan?

Decision: the three credential emails use Keycloak's built-in templates, unchanged. Provisioning sets the realm display name to the company name, which the built-in templates already print, and the realm's SMTP settings carry the tenant's sender name and reply-to. No theme is built, no branding value is written to the realm, and no `email-theme/` folder exists in `deploy/`. Every other email stays a branded React Email template sent by Genie. Local accounts remain in Keycloak: developers and end-to-end tests create users with a password through the admin API and never send an email, and a customer without an identity provider gets a working, plain-looking credential flow.

Why not realm localization overrides: Genie Ops Center can write `genie.*` message keys per realm through the admin API and a FreeMarker theme can read them through `msg()`, which gives full branding without Java. It costs a theme in `deploy/`, escaping rules for MessageFormat, a write on every branding save, and an integration test against a real Keycloak container, for three emails per user lifetime in a tenant type the first customer does not use. Why not a custom Java `EmailTemplateProvider`: same result, plus a jar built and re-verified on every Keycloak upgrade. Why not Better Auth email and password for local tenants: every email becomes React Email, but Genie Ops Center becomes a password store, realm policy and second factor move to plugins, single sign-on with genie-studio is lost for those tenants, and a second sign-in path lives in code.

Trade-off: a customer without an identity provider sees Keycloak styling on three emails and on the set-password page. In return there is one template system, one sign-in path, and no Keycloak artifact to maintain.

Guard: the branding save in core goes through one `applyBranding` step, which today updates the `branding` row only, so a realm write is one added call there and nowhere else. The realm template keeps `emailTheme` unset rather than absent, so a theme is a template value, not a schema change. The realm display name stays equal to the company name so the built-in and a future theme print the same name.

Designed in: now. Implemented: Section 2, in the local-accounts realm template variant. Revisit when a local-account customer asks for branded credential emails; the first step is then the localization override path above, which needs no Java.

## DEC-41. An absent groups claim keeps the previous memberships

Question: `idp` memberships are replaced on every sign-in from the token's `groups` claim. Microsoft Entra ID omits the claim when a person is in more than 200 groups (150 for SAML) and sends `_claim_names` and `_claim_sources` instead, and a broken mapper omits it too. In both cases the current rule deletes every group of the person, and every role held through a group with it. If `Tenant administrator` is held through a directory group, the tenant loses its administrators at the next sign-in, and the last-administrator guard on the admin screens never runs. What is the sync rule?

Decision: the sync distinguishes absent from empty. A present `groups` claim, even an empty list, replaces the `idp` memberships as before. An absent claim keeps the existing `idp` memberships untouched, lets the sign-in complete, and writes the audit event `auth:groups_claim_absent` with the user id. The onboarding runbook tells the customer to emit only the groups assigned to the application, which is the Entra setting that keeps the claim under the limit.

Why not more: a shrinkage alert needs a threshold nobody can set per customer, and the audit event already marks the one failure that matters. A last-administrator guard inside the sync would make Genie disagree with the directory when a customer really removed their last administrator from the group; the runbook already recovers that with `genie-ops admin add` or break-glass. Resolving the overage through the Graph API is a per-provider integration that the normalized claim was chosen to avoid.

Trade-off: a person removed from a group at the identity provider keeps that group's roles until the next sign-in with a present claim, or until an administrator removes them. In return an overage or a mapper mistake degrades to stale memberships and one audit line, never to a lockout.

Guard: membership sync is one function in core, `syncGroupMemberships(userId, claim | undefined)`, and the absent case is the `undefined` branch. Every sync test runs three cases: absent, empty, and present. A future overage resolver plugs into the caller before this function and hands it a present claim.

Designed in: now. Implemented: Section 2, item 5. Revisit if a customer cannot restrict the claim to assigned groups; the change is then a resolver for that provider in front of the sync, and it needs its own decision.

## DEC-42. Cross-module contracts live in `packages/core/contracts`

Question: a module that subscribes to another module's event needs the type of that event's payload, and a module may not import another module. Where does the shared type live: a new dependency-free package `packages/contracts`, or the existing folder `packages/core/contracts` where capability interfaces already live?

Decision: the existing folder. `packages/core/contracts` is the one place for every cross-module contract: capability interfaces, and the name, zod schema, and version of every event that more than one module handles. A module declares an event there when a second module subscribes, and both sides import the schema from core. The folder imports only zod and TypeScript types, nothing else from core, and the oxlint `no-restricted-imports` rule in `packages/config` enforces that.

Why not a separate package: a new workspace package costs a build target, a package manifest, an Nx project, and one more place to look, and the folder gives the same guarantee through one lint rule. Why not let the subscriber import the emitter's types: it would break the rule that a module never imports another module, and a type-only import still couples the two builds.

Trade-off: the folder sits inside core, so a contract change is a core change and goes through the core owner, even when only two modules care. That is the intended cost: a cross-module contract is platform surface.

Guard: the folder is self-contained by lint, so lifting it out is a move, not a rewrite. Every event in the folder carries a version, and a shape change is a new version beside the old one.

Designed in: now. Implemented: Section 1, with the events service. Revisit when `packages/ui` or a second product needs the same contracts; the change is then to move the folder to `packages/contracts` and point the imports at it.

## DEC-43. Migration safety is a lint in continuous integration, not a runtime check

Question: expand-then-contract and the three-release upgrade rule (`DEC-9`) are load-bearing, and only human review guarded them. What guards them in code?

Decision: one job in the pull request pipeline. Squawk lints every migration file that the branch changed, with its default rules and `pg_version` set to the deployed Postgres major, so a drop, a rename, a type change, or a new required column fails the job (`ban-drop-column`, `ban-drop-table`, `renaming-column`, `renaming-table`, `changing-column-type`, `adding-not-nullable-field`, `adding-required-field`). A deliberate contract migration carries `-- squawk-ignore <rule>` above the statement, and the reviewer confirms one thing: the contract lands at least one release after its expand. `drizzle-kit check` runs in the same job and fails when two branches each added a migration to one history. The migrator logs the count of pending migrations at start, so a large gap is visible in the deployment log.

Why not a `release` table and a migrator that refuses an image more than three releases ahead: every customer runs its own deployment, Genie hosts or manages most of them, and the deployment inventory names each customer's version, so a stack that lags by more than three releases is rare and visible. A table and a health rule for that case is speculative. The runbook rule stands: a lagging stack upgrades through the intermediate releases one at a time.

Trade-off: nothing in code stops an operator from deploying an image that is far ahead. Squawk matches SQL shapes, not intent, so a contract migration with the ignore comment passes the lint and depends on the reviewer for the release gap.

Guard: the lint job runs in the same pipeline as the other gates and blocks the merge into `develop`. The ignore comment is the only bypass and is visible in the diff.

Designed in: Section 0. Implemented: the image and the migrator in Section 0 item 5, the pull request lint and the pending count in Section 1 item 4. Revisit the first time a customer-hosted deployment is found more than three releases behind; the change is then a core table `release` (`version`, `started_at`) written on every successful start, read by the migrator, which stays unhealthy and logs the release to deploy first.

## DEC-44. File limit is 15 MB on the database adapter, raised only with `s3`

Question: `DEC-20` set 50 MB per file. node-postgres has no streaming path for a `bytea` value: a download holds the whole value in one buffer and an upload is sent hex-encoded, so the peak heap for one file is four to five times its size. Three 50 MB uploads at the same time exhaust a one gigabyte container, and any signed-in person can start them.

Decision: 15 MB per file on the `postgres` adapter. The peak heap for one upload is then about 75 MB, so five uploads at the same time stay under 400 MB. `FILE_MAX_BYTES` raises the limit per deployment, and the startup validation rejects a value above 15 MB unless `FILE_STORAGE_ADAPTER` is `s3`, because the `s3` adapter streams and the database never holds the bytes. The first migration sets the `file_blob` bytes column to external storage (`ALTER TABLE ... SET STORAGE EXTERNAL`), so Postgres does not compress a blob that is already compressed and a partial read does not decompress the whole value.

Why 15 MB and not 5 to 10 MB: a scanned contract or a phone photo often lands between 10 and 15 MB, and a lower limit sends those people to the operator. Why not a per-deployment byte quota: one customer owns the whole database, so the quota is the disk, which the host already monitors.

Trade-off: a document-bearing module on the `postgres` adapter cannot accept a file above 15 MB, and the customer must configure `s3` before go-live to get more (`DEC-20` names the migration path for a later switch).

Guard: the limit and the `s3` condition live in the startup validation of the environment (`DEC-9`), in one place, and the file service reads the validated value.

Designed in: Section 1. Implemented: Section 1 with the file storage service. Revisit if node-postgres gains streaming for large values; the change is then a higher default on the `postgres` adapter with the same variable.

## DEC-45. Every `genie-ops` command writes an audit event

Question: `genie-ops` runs setup, identity provider changes, administrator recovery, break-glass rotation, module toggles, and retirement, all privileged, and only `admin add` writes an audit event today (`DEC-23`). A customer cannot later answer who ran what and when in their own deployment.

Decision: every `genie-ops` command writes one row into the existing `audit_event` table through one helper that the command runner calls around each command: `actor_user_id` null, `action` set to `ops:<command>`, `metadata` with the operating-system user name, the non-secret arguments, and the outcome. No new table, no new screen; the audit reader (Section 2, item 12) gains one filter for operator rows.

Why not more: an operator table in a separate store is a control plane, which ADR 0007 removed. A signed record or a named operator identity needs a credential per operator, which the command line does not have, and the written request in `DEC-23` already carries the "who".

Trade-off: the user name is weak evidence, because `docker compose exec` runs as one user, so the row proves what happened and when, not reliably who. The setup steps before the database exists and the final delete of `retire --confirm` cannot write a row and log to the command output only.

Guard: the helper is the one place a command touches `audit_event`, and the command-line test suite asserts one row per command run.

Designed in: Section 1. Implemented: Section 1 item 10 with the command line, on the `audit_event` table that Section 1 item 1 creates (moved there from Section 2 on 2026-09-17 so that Section 1 owns every table its commands write); filter in Section 2 item 12. Revisit when a customer contract asks for a named operator identity; the change is then a per-operator credential in the command line and its name in the same row.

## DEC-46. How a running process sees a changed setting, branding, or entitlement

Question: `DEC-34` builds the tenant context once at startup, but the Tenant Settings page changes settings, the Branding pages change branding, and `genie-ops module enable|disable` changes entitlements while the process runs. How does a running process, and the worker beside it, see the new value?

Decision: the tenant context holds two kinds of members. Fixed members live for the whole process: the database pool, the file store, and the values read from the environment. Changing members are settings, branding, and entitlements, and the context exposes each as a reader with a process-local cache that expires 10 seconds after it was filled. A reader that finds its cache expired reads the row again. Nothing invalidates the cache on a save. An entitlement is a feature flag with a whole module as the unit, set per deployment by the operator; it can only switch on a module that is compiled into the image.

The session idle timeout follows the same rule. The application reads `session_idle_minutes` through the settings reader on every request and compares it with the session's last activity time. Better Auth's `expiresIn` is a fixed absolute cap of 24 hours and no longer carries the idle value, so a change to idle minutes needs no rebuild of the auth instance.

Why not `pg_notify`: instant invalidation needs one long-lived listener connection per process outside the pool, reconnect logic when it drops, a cache keyed per tenant context so the isolation test still passes, and a fallback timer anyway for a lost notification. A 10 second delay after a save is invisible to the person who clicks Save and reloads. Why not a read on every request: it is simpler still, but it puts three reads on the path of every render for values that change a few times a year. Why not Redis: every deployment is one customer with one Postgres, and Postgres already carries the cache, the job queue, the rate limit counters, and the sessions; a second stateful service is a second thing to back up, secure, and lose. Why not a restart after every change: a branding edit becomes an outage, and a customer-hosted deployment cannot be asked to restart for it.

Trade-off: a save can take up to 10 seconds to show in another process, and a save is visible in one process before another. A session cookie that was already issued keeps its old expiry until the next refresh, so a lower idle value applies on the next request, not on the cookie.

Guard: the readers are the only members of the context that reach `tenant_settings`, `tenant_branding`, and `tenant_module`, and the isolation test from `DEC-34` builds two contexts in one process and proves that each reader caches its own tenant.

Designed in: Section 0. Implemented: the readers in Section 1 item 1 with their tables; the settings reader is first read by the sessions of Section 2 item 4. Revisit when a customer needs a change to show within a second, or when a deployment runs several application replicas; the change is then a `pg_notify` channel that every save fires and that clears the same caches, and the 10 second expiry stays as the fallback.

## DEC-47. One tenant brand color, plus a font size preset and a text color

Question: `tenant_branding` carried three colors, primary, secondary, and accent, each with a computed foreground. The shell design found no surface that uses a secondary color, and an accent with no named surface cannot be contrast-checked, because a check needs the pair that is rendered. Which colors does a tenant set?

Decision: one color. `primary_color` fills the `--primary` variables and `primary_foreground` is computed and stored. It shows as small accents (the active navigation row, primary buttons, the focus ring, count pills), on the sign-in page, and in emails; the sidebar and the page chrome stay neutral. Two typography fields join it. `font_size` is a preset, `compact` (14 px), `default` (15 px), or `large` (16 px), that sets the root font size; the type scale is rem-based, so every size follows. `text_color` is the heading and body color on light surfaces, checked at 4.5:1 against white and the subtle surface; the dark theme keeps its fixed value. Every contrast failure blocks Publish and offers the nearest passing shade.

Why not three colors: a color with no surface is a value nothing reads, and a contrast check cannot protect a pair that no screen renders. Why not a free font size: three presets keep every rem-based control at a size the design checked, and a customer asks for larger or smaller, not for 15.5 px.

Amended 2026-09-17, solid surfaces only: the tenant primary color fills solid surfaces and the focus ring, which are the primary button, the count pill, the active navigation row's text, and the ring. Every tinted surface stays a fixed neutral gray, including the avatar background and the Admin portal pill. Core derives no tint ramp from the tenant color, so `packages/ui` needs no color-space computation and no per-step contrast check. Only `--primary` and `--primary-foreground` are computed, and `primary_foreground` is already stored. Why: a derived ramp fails when a tenant picks a near-white or a near-black primary, and each derived step would need its own contrast check in both themes. A tinted surface that is blue while the tenant color is teal reads as half-branded, so those surfaces are gray instead.

Trade-off: a brand with two colors expresses one. The `compact` preset lowers rem-based control heights below the 44 px touch target; the design owns that rule and its resolution.

Guard: the token layer is emitted from `tenant_branding` alone and the branding save goes through the one `applyBranding` step of `DEC-40`, so a second color is one column, one variable, and one contrast pair.

Designed in: Section 3. Implemented: Section 3 items 2 and 5. Design files affected: `design/product/sections/branding/` (specification, types, data, captures), `design/product/design-system/tokens.md`, `design/product/shell/spec.md`. Revisit when a surface needs a second color; the change is `secondary_color` with a named surface and its own contrast pair, never an accent without a surface.

## DEC-48. How `can()` and `scopesFor()` read, and when a role change applies

Question: `DEC-39` fixes what `can()` and `scopesFor()` answer and `DEC-46` fixes how settings, branding, and entitlements are read, but nothing says how the two access functions read the assignment tables. The shell renders one `can()` per navigation entry and a page calls it again for every action it shows, so the answer decides the cost of every render. It also decides when a role granted or revoked while a person is signed in takes effect.

Decision: one loader per request. The tRPC context and the page loader each build a lazy loader on the request. The first `can()` or `scopesFor()` call in that request reads the person's role assignments once, with their scopes and the permission keys of their roles, and every later call in the same request answers from that memory. The loader lives only for the request and is never shared between requests. The job worker builds one per job run. A role granted or revoked applies on the next request. The stub `can()` of Section 0 keeps this shape with a loader that holds only `placeholder.read`, so replacing it in Section 2 item 6 changes the loader and nothing that calls it.

Why not one database read per call: a navigation with twelve entries and a page with six actions is eighteen reads for one render, for rows that cannot change inside the request. Why not a 10 second cache like `DEC-46`: settings and branding are safe to show stale for 10 seconds, a revoked role is not, and a person whose access was removed must not reach a record on the following click. Why not a per-user cache with invalidation: it needs a key per user and per process plus a clear on every assignment write, which is `pg_notify` by another name, for a read that costs one query per request.

Trade-off: one assignment query on every request that checks a permission, even when the shell only renders navigation. At our customer scale that query is indexed on `user_id` and returns a few rows.

Guard: `can()` and `scopesFor()` are the only readers of `role` and `role_assignment` outside the roles admin, and the shared test suite from `DEC-39` runs both functions against one loader, with one test that counts a single query for many calls in one request and one test that proves a revoked role is refused on the next request.

Designed in: Section 0, as the shape of the stub. Implemented: Section 2 item 6. Revisit when a customer needs a revoke to end a session that is mid-request, or when the per-request query shows in a profile; the change is a per-user cache cleared by the assignment write, and every caller stays the same.

## DEC-49. The landing page after sign-in is the module's own hub

Question: `OPEN-8` asked whether the page after sign-in is the solutions module's own hub, or a core page named Dashboard that renders a module's catalogue through a landing-slot contract point. The shell design had run ahead with a Dashboard entry while the recorded default said the opposite, so the two trees disagreed on the first page a person sees.

Decision: the default stands. The page after sign-in is the solutions module's own hub, reached through the module's navigation. One workspace navigation entry can be marked the landing route in the module contract, and core sends a person there after sign-in. No core page named Dashboard exists, and core gets no landing-slot contract point.

Why not a core landing page: a core page that renders a module's catalogue needs a landing-slot contract point, and that slot would serve exactly one widget today, so its requirements would be guesswork. Core needs only to know which navigation entry is the landing route, which is one flag on an entry it already renders.

Trade-off: a tenant with two modules lands on one module's hub, not on a page that shows both, until a core Dashboard exists. The shell specification and two shell components in the design tree lose their Dashboard entry.

Guard: the landing route is one flag on a navigation entry and nothing else in core knows the hub, so a later Dashboard replaces the target of that flag without touching a module. The dashboard widget slot stays on the not-built list in `../architecture/module-contract.md`, and that list is the path that reopens it.

Designed in: Section 0, the Navigation row of the module contract. Implemented: Section 3 item 4, the shell. Design files affected: `design/product/shell/spec.md` and the shell components. Revisit when a second widget exists and has requirements; the change is a Dashboard page in core with declared widget slots, added to the contract as the list foresees.

## DEC-50. An administrator switches a module on or off, sees who reaches it, and places it in a category

Question: switching a module on or off was `genie-ops module enable|disable`, which only an operator with shell access runs. Which groups see a module was a role assignment with no view per module. A module had no place in a category. The requirement is that a tenant administrator does all three from the admin portal, as they do for one solution.

Decision: core gets a Modules page in the admin portal behind `core:settings:manage`. It lists every module compiled into the image with an enabled switch that writes `tenant_module.enabled` through the same core procedure as the command line, a category picker that writes `tenant_module.category_id` (`DEC-51`), and the groups and people who hold a role carrying the module's `<id>:use` key, read from `role_assignment` like the solutions Access overview, with a link to the Roles screen for changes. The module contract requires every module with a workspace entry to declare `<id>:use`, to require it on its workspace entries, and to seed a `<Display name> user` role that carries it. Every change on the page is an audit event.

Why not a new `core:modules:manage` key: the page changes the same rows as the Tenant Settings module cards, and `DEC-23` counts six core keys, so a seventh returns with the separation-of-duties revisit there. Why not assign roles on the Modules page: the Roles screen already assigns a role to a group or a person, and a second writer of `role_assignment` is the duplicate that `DEC-39` forbids.

Trade-off: the customer's administrator can switch off a module Genie switched on, and switch on a compiled module an operator switched off. The image is the commercial boundary (`DEC-33`): a module that a customer does not have is not compiled in, so the switch is visibility, not a sale.

Guard: one core procedure writes `tenant_module.enabled`, and the command line and the page both call it. The Section 4 entitlement gating test runs through that procedure.

Designed in: Section 0, the Permission keys, Default roles, and Navigation rows of the module contract. Implemented: Section 3 item 11. Design files affected: the admin portal navigation and a new Modules page in the design tree. Revisit when a customer needs per-person visibility set from this page; the change is an assign control that calls the roles procedure, not a new table.

## DEC-51. Navigation categories belong to core

Question: `category` and `solution_category` were solutions module tables, so only a solution could sit in a category, and the navigation tree a module returned carried its own groups. A custom module placed in a category by `DEC-50` would need a second category system in core, and the shell would show two.

Decision: `category` (id, name, position) is a core table with a Categories page in the admin portal behind `core:settings:manage`. The solutions module keeps `solution_category` and references the core category by id, as module rule 2 in `../architecture/data-shape.md` allows. A module's navigation tree is `{ pinned, entries }`, where an entry built from a record can carry `categoryId`. Core groups the entries by its own `category` table, places a module's static workspace entries under `tenant_module.category_id`, and renders one tree. Deleting a category leaves its members ungrouped: a module treats a category id that no longer exists as no category, so core never touches a module table.

Why not separate module categories in core: two category systems in one tree, and an administrator who asks why a module and a solution cannot share a heading. Why not one core catalogue as the landing page: `DEC-49` made the hub the solutions module's page, and a core catalogue reopens it for a requirement that the tree already meets.

Trade-off: the solutions module loses ownership of a table it designed, and a category delete can leave a dangling id in `solution_category` by design. The solutions Categories screen moves to the admin portal.

Guard: the Navigation row of the module contract names `categoryId` as a core `category` id, and core's tree builder reads only `category` and `tenant_module`. The placeholder module's navigation test covers an entry with a category, an entry without one, and a deleted category.

Designed in: Section 0, the Navigation row. Implemented: Section 3 item 11 for the table and the pages, Section 4 item 1 for the solutions entries. Design files affected: `design/product/shell/spec.md` for the tree, and the solutions admin Categories screen, which becomes a core admin page. Revisit if a record needs more than one category; the change is the key of `solution_category`, as the solutions README already says.
