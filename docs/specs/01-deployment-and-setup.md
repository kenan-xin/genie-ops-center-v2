Confidence: 8.4/10

Business scenarios: [CF-MA-01 and CF-MA-08](../flows/module-access-upgrades.md) describe new-module setup and retained access after re-enable. R-27/R-68a and the activation verification below provide their implementation requirements and proof. The registration owner of R-27 is decided (DEC-50, Registration reconciliation owner). The removal-side branches, removal reconciliation and in-flight cancellation, remain explicitly open.
Reasoning: Every requirement below traces to a roadmap item, a decision entry, an architecture contract, or the cross-section calls table, and the contracts for the tables, the environment, and the module points are complete enough to implement against. The drafting-round questions are closed: the pg-boss policy `key_strict_fifo` was confirmed against the current library documentation, the not-set-up page design lists the seven `setup_step` names in run order, the upgrade runbook names the setup rerun, the SMTP client is named, and an independent review corrected the proxy-network aliases and the disabled-module behavior. Three points recorded on 2026-09-23 stay open and are listed under Open questions: the worker's relation to the migrator run and the entitlement answer before `seed` (they gate S1-09, `genie-ops-center-v2-1ia.8`), and whether the `roles` step seeds definitions for a module registered disabled (Section 2). The ledger spelling for a hyphenated id was decided the same day (R-9). The score stays below nine for one reason: nothing here has been built, so every interface is proven against documentation and library documentation, not against a running deployment, and the review that found a wrong library fact shows that documentation review can still miss things.
Status: Approved by the product owner for ticket breakdown, 2026-09-23, with Nodemailer confirmed as the SMTP client of R-43 and the registration owner of R-27 decided (DEC-50).

## Goal and scope

Section 1 takes one customer's stack from an empty database to a running deployment that an operator can set up with one command, in any hosting mode, from that customer's image.

In scope: the deployment tables in the core migration history, the settings, branding, and entitlement readers on the tenant context, the file store, the integration record, the mailer, the job worker, the event bus, the `genie-ops` runner with the commands whose tables land here, the not-set-up page, the `degraded` health answer, the migrator's operator surface, the stack template, and `PUBLIC_URL` as the one public address.

Out of scope, and named under Deferred: everything that needs a `user` row or a realm. Section 2 creates `user`, adds the foreign keys to the nullable actor columns created here, and appends the realm, client, role, administrator, and break-glass steps to `genie-ops setup` together with `idp set`, `admin add`, and `break-glass rotate`.

Boundary with Section 0. Section 0 delivers the image, the module registry, `createTenantContext()` with its fixed members, the migrator with its advisory lock and `LOCK_TIMEOUT_MS`, the stub `can()` that grants only `placeholder:read`, the three test layers, the logging rules, and the security headers. Section 1 adds members to the same context object, adds operator surface to the same migrator, and adds contract points to the same placeholder module. Section 1 creates no second seam.

Boundary with Section 3. Section 1 writes `tenant_settings` and `tenant_branding` once at setup. The screens that edit them, and the token layer that renders branding, are Section 3.

## Sources

- `../core/roadmap.md`, Section 1 items 1 to 11, including 7a and 9a, and its definition of done. Section 0 items 3, 3a, 4, 4b, and 5 for what exists first. "Order and parallelism" for the sequence.
- `../core/vision.md`: "Product shape", "Deployment (operators only)", the Decided table, `OPEN-7`.
- `../core/decision-log.md`: `DEC-12`, `DEC-14`, `DEC-17`, `DEC-18`, `DEC-20`, `DEC-23`, `DEC-33`, `DEC-34`, `DEC-35`, `DEC-36`, `DEC-37`, `DEC-38`, `DEC-42`, `DEC-43`, `DEC-44`, `DEC-45`, `DEC-46`. `DEC-9`, `DEC-10`, and `DEC-19` from the Decided table of `../core/vision.md`.
- `../architecture/data-shape.md`: "Deployment tables", "Tenant settings", "Branding", "Files", "Integrations", "Audit", "Module tables".
- `../architecture/environment-contract.md`: "Required", "Mail", "Files", "Optional", "Rules".
- `../architecture/module-contract.md`: "What a module declares" (Events, Capabilities, Jobs, Integrations, Inbound endpoints), "What core provides to a module", "How modules talk to each other".
- `../architecture/repository-layout.md`: the `customers/<slug>/deploy/` and `deploy/` parts of "Layout".
- `../core/tech-stack.md`: "Data", "Communication", "Delivery".
- `../adr/0007-one-deployment-per-customer.md`, `../adr/0005-tenant-migrations-at-deploy.md`.
- `../runbooks/deployment.md`: "Set up a new customer", "Upgrade", "Recovery by scenario".
- `../design/sections/sign-in-and-tenant-pages/spec.md`, `types.ts`, `data.json`: the not-set-up page only.
- `../specs/README.md`: "Section boundaries" and "Cross-section calls made in the drafting round", for the readings the six drafts share.

## Requirements

### Deployment tables and the tenant context

R-1. The core migration history gains one migration that creates `tenant_module`, `tenant_api_key`, `setup_step`, `retirement`, `rate_limit_window`, `tenant_settings`, `tenant_branding`, `audit_event`, `file`, `file_blob`, and `tenant_integration`, with the columns, keys, and indexes of `../architecture/data-shape.md` ("Deployment tables", "Tenant settings", "Branding", "Files", "Integrations", "Audit"). `file` and `file_blob` are created here because `tenant_branding` references `file.id` for its logos and favicon and because item 7 stores bytes in the same section (`../core/roadmap.md`, Section 1 items 1 and 7).

R-1a. `tenant_module.category_id` is created nullable and without a foreign key, because `category` does not exist yet. The Section 3 migration that creates `category` adds that foreign key. `category` and `user_preference` are Section 3 tables and are not created here (`../architecture/data-shape.md`, "Deployment tables", `tenant_module`, and the "Deployment tables" row of `../specs/README.md`, "Section boundaries").

R-2. Every column in that migration that names a person is nullable and carries no foreign key: `tenant_settings.updated_by_user_id`, `tenant_branding.updated_by_user_id`, `audit_event.actor_user_id`, `file.uploaded_by_user_id`, `tenant_api_key.created_by`, and `tenant_integration.created_by_user_id`. Those six are the whole list. The Section 2 migration that creates `user` adds each foreign key (`../architecture/data-shape.md`, "Rules", rule 7, `../core/roadmap.md`, Section 1 item 1, and the "Nullable user columns" row of `../specs/README.md`, "Cross-section calls made in the drafting round").

R-3. The same migration sets the `file_blob` bytes column to external storage, so Postgres does not compress bytes that are already compressed and a partial read does not decompress the whole value (`DEC-44`, Guard).

R-4. pg-boss owns its own schema in the same database and creates it through its own migration at worker and application start. The core migration history does not carry pg-boss tables (`DEC-12`, `../architecture/data-shape.md`, "Deployment tables").

R-5. The tenant context gains three changing members: a settings reader over `tenant_settings`, a branding reader over `tenant_branding`, and an entitlement reader over `tenant_module`. Each holds a process-local cache that expires 10 seconds after it was filled, and a reader whose cache has expired reads the row again. No save invalidates a cache, no notification channel exists, and no process restarts on a change (`DEC-46`).

R-6. The tenant context gains one fixed member, the file store, built once at startup from `FILE_STORAGE_ADAPTER` and the validated file variables (`DEC-34`, `DEC-46`, `../architecture/environment-contract.md`, "Files").

R-7. These readers are the only code that reads `tenant_settings`, `tenant_branding`, and `tenant_module`, and the file store is the only code that reaches `file_blob`. Core exports no settings, branding, entitlement, or storage singleton, and the oxlint import ban of Section 0 keeps the database driver out of every module and app file (`DEC-34`, `DEC-46`, Guard).

R-8. A module whose `tenant_module.enabled` is false stays mounted and refuses. The registry hides its navigation entries, and every one of its routes and procedures refuses the request, reading the entitlement through the reader of R-5. It is never unmounted, because refusing and not existing must stay distinguishable: an excluded module's routes do not exist at all, which is what the smoke test of R-31 tells apart (`../core/roadmap.md`, Section 0 item 4, Section 1 item 1, and Section 4 item 4, `../adr/0003-one-image-all-modules.md`, and the "Disabled module" row of `../specs/README.md`, "Cross-section calls made in the drafting round").

### Migrations, the health answer, and the migration lint

R-9. The migrator of Section 0 item 5 is callable as `genie-ops migrate`. Every module ledger is `drizzle.__drizzle_migrations_` followed by the module id with every hyphen written as an underscore, so module `contract-data` has `drizzle.__drizzle_migrations_contract_data`. Written `drizzle.__drizzle_migrations_<id>` below, with `<id>` in that form. Core's registry validation rejects a module whose `schema.migrationsTable` is anything else, and the migrator passes `migrationsSchema: "drizzle"` explicitly instead of relying on Drizzle's default (DEC-50, amended 2026-09-23). It applies the core history and then each included module's history in registry order, under the one advisory lock with `LOCK_TIMEOUT_MS`, and it is idempotent, so a rerun after a fix continues from where it stopped (`../core/roadmap.md`, Section 1 item 4, `DEC-9`, `../adr/0005-tenant-migrations-at-deploy.md`).

The CLI and setup call that same migrator with the dedicated-session invariant and cleanup rules of `00-monorepo-foundation.md` R-25a/R-26a. They introduce no separate lock path: concurrent startup and CLI migration runs serialize on the same database/key and are covered by the Section 0 AC-9 concurrency checks.

R-10. At start, before applying anything, the migrator logs the count of pending migrations across the core history and every included module's history, as one structured line, so an upgrade of a stack that lagged is visible in the deployment log (`DEC-43`, `../runbooks/deployment.md`, "Upgrade").

R-11. The health endpoint is `GET /api/health`, unauthenticated, and its body is `ok` or `degraded` and nothing else. It never carries error text, a stack trace, a database message, a version, or a secret. Section 0 returns `ok` on that path, and this section adds `degraded` on the same path (`DEC-9`, `DEC-31`, `../specs/README.md`, "Cross-section calls made in the drafting round", the health endpoint row). It answers `degraded` while the setup gate of R-15 is not satisfied, and `ok` otherwise.

R-12. A migration failure at start keeps the process from serving, so the container health check fails and the previous version keeps serving. A failed migration never produces a `degraded` answer, because the endpoint never answers at all (`../core/roadmap.md`, Section 0 item 5, `DEC-9`).

R-13. The pull request pipeline gains one job that runs Squawk over every migration file the branch changed, with `pg_version` set to the deployed Postgres major, and `drizzle-kit check` beside it. A drop, a rename, a type change, or a new required column fails the job unless the statement carries `-- squawk-ignore <rule>`, and `drizzle-kit check` fails when two branches each added a migration to one history. The job blocks the merge into `develop` (`DEC-43`).

### The not-set-up page

R-14. The running image carries a constant list of the `setup_step` names it knows. Section 1 defines that list and Section 2 lengthens the same list. In this section it is `migrations` and `seed`, two of the seven names the `setup_step` table enumerates (`../core/roadmap.md`, Section 1 item 5, `../architecture/data-shape.md`, "Deployment tables", `../specs/README.md`, "Cross-section calls made in the drafting round", the setup-steps row).

R-15. The setup gate is satisfied when, for every step name in the list of R-14, a `setup_step` row exists with state `done`. A missing row, a `pending` row, and a `failed` row each leave the gate unsatisfied. The gate reads `setup_step` directly and is not one of the cached readers of R-5, because a stale answer here would leave a set-up deployment showing the not-set-up page.

R-16. While the gate is unsatisfied, every route renders the not-set-up page and the health endpoint answers `degraded` (`../core/roadmap.md`, Section 1 item 2). The page renders without the application shell, is neutral rather than tenant-branded because branding may not be seeded yet, lists each known step with its state and the detail line of a failed step, and offers a visitor no action (`../design/sections/sign-in-and-tenant-pages/spec.md`, "UI Requirements", the not-set-up page).

R-17. The page lists only the steps the running image knows. Section 2 lengthens the list of R-14 with its own steps, so an image that carries Section 2 running against a database that only completed Section 1 shows the not-set-up page again until the operator runs `genie-ops setup` once more, which runs the new steps and leaves the earlier ones alone. The release notes of a release that adds a step name the rerun, and `../runbooks/deployment.md`, "Upgrade", step 5 is the operator's instruction (`../specs/README.md`, "Section boundaries", the not-set-up-page row, and "Cross-section calls made in the drafting round", the setup-steps row).

### `genie-ops setup`

R-18. `genie-ops setup` runs inside the image, is resumable through `setup_step`, and runs each step it knows in the order the `setup_step` table records: `migrations`, `seed`, `realm`, `clients`, `roles`, `admin_seed`, `break_glass`. This section knows the first two, and Section 2 fills the rest into the same order. `seed` runs right after `migrations`, so the later `roles` step finds every compiled module's entitlement when it seeds default roles (`../architecture/data-shape.md`, "Deployment tables", `setup_step`, and the "Setup step order" row of `../specs/README.md`, "Cross-section calls made in the drafting round"). Before a step runs, its row is written or moved to `pending`. On success the row moves to `done`. On failure the row moves to `failed` with the cause in `detail`, the command stops, and a later run starts again at that step (`../core/roadmap.md`, Section 1 item 5, `../architecture/data-shape.md`, "Deployment tables", `../runbooks/deployment.md`, "Set up a new customer").

R-19. Step `migrations` runs the migrator of R-9 and nothing else.

R-20. Step `seed` does three things in one transaction: it inserts one `tenant_module` row for every module compiled into the image, it writes the single `tenant_settings` row from `tenant.yaml`, and it writes the single `tenant_branding` row from `branding.seed.json`. Until this step is `done`, it is the only writer of `tenant_module` rows (`../architecture/data-shape.md`, "Deployment tables", `setup_step`). After it is `done`, the migrator run of R-27 registers a newly compiled module, and a rerun of this step never overwrites a row it finds. The step is idempotent, so a rerun leaves an already-seeded deployment unchanged rather than overwriting an administrator's later edits.

R-21. `tenant.yaml` supplies the module list, the onboarding mode, `local_accounts`, the first administrators, and the break-glass email, and nothing else. `branding.seed.json` supplies authored seedable branding values under the [branding seed contract](../architecture/branding-seed.md), including required company name, product name, locale and time zone. Bookkeeping and derived foreground are not authored; omitted values follow approved defaults. No value lives in both files, and neither file repeats a value that `.env` holds (`DEC-35`, `DEC-36`, `../architecture/repository-layout.md`, "Layout").

Amendment 2026-09-21: initial branding follows the [approved seed requirements](../architecture/branding-seed.md), including required customer identity/locale/time zone, deferred application-email configuration, standard appearance defaults and notice validation. Its open questions are not implementation defaults. Earlier column inventories do not require every column to be authored.

R-22. Each file is parsed through its own strict zod schema in `packages/core/src/lib/tenant-config/`, which rejects an unknown key, so a value placed in the wrong file fails the command with a message that names the key and the file. The same two schemas are what `nx g @genie/generators:tenant-new` validates, so the generator and the command cannot disagree (`DEC-35`).

R-23. `nx run core:schemas` writes the JSON Schema of each of those two zod schemas into `deploy/schemas/`, committed, and continuous integration fails when a committed file is stale. `tenant.yaml` opens with a `yaml-language-server` schema comment and `branding.seed.json` carries a `$schema` key that the loader strips before parsing, so an editor validates both files as an operator types them (`DEC-35`).

R-24. Setup writes `tenant_settings.updated_by_user_id` and `tenant_branding.updated_by_user_id` as null, because no `user` row exists yet (`../architecture/data-shape.md`, "Tenant settings").

R-25. Setup sends no email and needs no mailer. It pre-adds nothing that requires one in this section, and a deployment with `MAIL_PROVIDER` unset completes setup (`../core/roadmap.md`, Section 1 item 8, `../architecture/environment-contract.md`, "Mail").

R-26. Setup has no completion flag of its own. A deployment is set up when every step of R-14 is `done`, which is the gate of R-15, so a later section that adds a step needs no second source of truth.

R-27. On upgrade once the `seed` step is done, startup registers a newly compiled module with no existing row as `enabled: false`. An authorized administrator must configure and explicitly enable it; no user/group role assignment or Tenant administrator admin-key append is created merely by registration. Preserve existing enabled states, configuration, category placement, roles, assignments, and memberships. First-time setup retains R-20's initial policy. Permission evolution follows ../architecture/permission-evolution.md. The migrator run owns registration, under its advisory lock and before the process serves requests or consumes jobs: it first runs the R-79 omission check, then, after the migrations commit, inserts the missing rows in one transaction with `ON CONFLICT DO NOTHING`, so a repeated start changes nothing (DEC-50, Registration reconciliation owner). The insert runs only when `seed` is `done`. Before that the run inserts nothing, and R-20 writes the initial rows. This applies to every migrator run of R-9 and R-19, at start, in `genie-ops migrate` and in setup's `migrations` step. Core extends the migrator run contract of R-9, which today accepts only the histories, so that the omission check runs before the migrations and the conditional insert runs after they commit, inside the same advisory-lock session. The extended run takes the compiled-module list as a required field, because the check compares compiled ids with installed ids, and histories are a derived list that a caller can filter. The migrator builds a history and a ledger for every compiled module, including one with no migrations, and keeps doing so, because a skipped empty history would hide that module from the check before `seed`. S1-11 implements that extension. A module the run registers disabled after `seed` and before the later `roles` step is a compiled module with a disabled row when `roles` runs. That step creates no user or group assignment and no Tenant administrator admin-key append for it, because DEC-23 appends that key only on enable. Whether `roles` seeds that module's default role definitions is open until Section 2 specifies the step. Open: whether the worker process runs the migrator run itself or waits for another process's run, including the registration commit. Either way it consumes no job before the omission check and the registration have committed (DEC-50).

### Stack template and the smoke test

R-28. `deploy/stack/` holds the stack template: a compose file that starts the application, the job worker from the same image with the worker entrypoint flag, and Keycloak, plus Helm values and a `.env.example` generated from the environment schema. It holds no secret and no host-specific value (`../core/roadmap.md`, Section 1 item 6, `../architecture/repository-layout.md`, "Layout", `../architecture/environment-contract.md`, "Rules"). The compose file publishes no port on the host: the application service and the Keycloak service join an external Docker network named `proxy` with the network aliases `<slug>-app` and `<slug>-keycloak`, written by the generator from the folder name, so several stacks on one host never clash and the host's reverse proxy routes each hostname to one stack (`../runbooks/reverse-proxy.md`). The slug is the generator's input, not a host value, so the file stays committable. The smoke test of R-31 therefore reaches the application through a proxy container on that network, or through `docker compose exec`, never through a host port.

R-29. `nx g @genie/generators:tenant-new <slug>` always writes the same seven files into `customers/<slug>/deploy/`: `tenant.yaml`, `modules.txt`, `realm.overrides.json`, `branding.seed.json`, `compose.yaml`, `.env.example`, and `values.yaml`. `values.yaml` is written even for a customer who does not run Kubernetes, so the generator has no branch and the Helm path stays open. The compose file is committed, and the real `.env` is never committed (`DEC-22`, `../architecture/repository-layout.md`, "Layout", and the "Tenant generator files" row of `../specs/README.md`, "Cross-section calls made in the drafting round").

R-30. The compose file pulls the image tag from `IMAGE_TAG`, which the compose file reads and the image never does, so an upgrade is a change to that value and a restart (`../architecture/environment-contract.md`, "Read by Docker Compose, not the image").

R-31. Against a fresh database, a smoke test boots a customer image from its generated compose file with an include list that leaves one module out, and proves three things: the application serves, the excluded module's tables do not exist in the database, and every route of the excluded module answers as an unknown route rather than as a refusal. A refusal would prove the module is present and switched off, which is the other case (`DEC-33`, `../core/roadmap.md`, Section 1 item 6).

### File storage

R-32. Core exports one `FileStorage` interface with three operations: store bytes for a `file` id, fetch bytes for a `file` id, and issue a short-lived tokenized download link. The adapter is selected at startup from `FILE_STORAGE_ADAPTER`, and this section ships the `postgres` adapter only (`DEC-20`, `../architecture/environment-contract.md`, "Files").

R-33. The `postgres` adapter writes bytes to `file_blob` in the same transaction that writes the `file` row, keyed by the file id.

R-34. The `file` row never records which store holds its bytes. `storage_key` is an opaque key that every adapter derives from the file id alone. Nothing outside the adapters reads or writes `file_blob` or a bucket. These two rules are what keeps a future `genie-ops files migrate` a copy plus an adapter switch, and no change may close that path (`DEC-20`, "Change of adapter after go-live").

R-35. Uploads go through the application in one request. The accepted size is `FILE_MAX_BYTES`, default 15728640, and the startup validation rejects a value above the default unless `FILE_STORAGE_ADAPTER` is `s3`. The limit and that condition live in the startup validation of the environment, in one place, and the file service reads the validated value (`DEC-44`, Guard, `../architecture/environment-contract.md`, "Files").

R-36. Uploads pass a type allow-list of document and image types. A file whose declared type is not on the list is refused before any byte is stored (`DEC-20`).

R-37. Every uploaded `image/svg+xml` file passes DOMPurify on jsdom in core, in the upload request, before the bytes reach `FileStorage`. The sanitizer runs with the SVG profile only (`USE_PROFILES: { svg: true, svgFilters: true }`), forbids `foreignObject` and `style`, and allows only references inside the file, so it strips scripts, event handler attributes, external references, and foreign objects. A file that is empty after sanitizing is refused. The sanitized bytes are what gets stored (`DEC-20`, "Amended 2026-09-17, SVG sanitizing").

R-38. A download is an application-issued link carrying a short-lived token. The token is issued only after a `can()` check on the record that owns the file, and the link is never written to a log (`DEC-20`, `DEC-31`). In this section the only caller is the placeholder module, because `can()` is still the Section 0 stub that grants `placeholder:read` alone.

R-39. `file.scan_status` exists from this migration with the values `pending`, `clean`, `infected`, and `skipped`. Every file created in this section is written as `skipped`, and `pending` is entered only once a scanner exists. A file is served only when `scan_status` is `clean` or `skipped`. Adding a scanner later flips the value and needs no migration (`DEC-20`).

### Integration records

R-40. `tenant_integration` holds a module's connection to a customer system: kind, name, non-secret configuration, a `secret_ref` that names an entry in the host's secret store, status, and the last check and last error (`../architecture/data-shape.md`, "Integrations").

R-41. Core ships one service that resolves an integration to its configuration plus the live secret at call time, reading the secret from the environment by the name in `secret_ref`. A credential is never written to the database and never logged (`DEC-20`, `../architecture/module-contract.md`, "What core provides to a module").

R-42. Core ships no connector and no integration screen. The first module that needs a connector ships both through its pages slot, and core lifts the screen into Tenant Settings only when a second module needs one (`DEC-20`, `../architecture/data-shape.md`, "Integrations").

### Mailer

R-43. Core ships one mailer interface with two adapters behind it, selected by `MAIL_PROVIDER`: a hosted-provider adapter for `resend` and an SMTP adapter for `smtp`. `MAIL_FROM` is the sender address, and the display name comes from `tenant_branding.email_sender_name` through the branding reader of R-5 (`../core/roadmap.md`, Section 1 item 8, `../architecture/environment-contract.md`, "Mail").

R-44. Every template renders an HTML part and a plain-text part, and the mailer sends both. Neither adapter may derive one part from the other (`../core/roadmap.md`, Section 1 item 8).

R-45. `MAIL_PROVIDER` unset means no mailer. In production, an action that must send an email fails before it creates anything, so no half-finished record survives a missing mailer. In development the link is logged instead (`../core/roadmap.md`, Section 1 item 8, `../architecture/environment-contract.md`, "Mail").

R-46. `genie-ops setup` and, when Section 2 adds it, `genie-ops admin add` send no email. They pre-add a pending person, and the first sign-in activates them, so a deployment is set up and its first administrator signs in before any mail server exists (`DEC-23`, `../runbooks/deployment.md`, "Before you start").

R-47. A local-accounts realm sends its own set-password, reset, and verify emails through the realm's own SMTP settings, with Keycloak's built-in templates and the realm display name. Those three emails never pass through this mailer, and no branding value is written to the realm (`DEC-10`, `DEC-40`).

R-48. The template catalogue declared in this section holds: invitation with a brokered variant and a local-account variant, role granted, role removed, new-device sign-in, and module notification. The templates and the mailer land here. The events that send them land in Section 2 item 8 and in the first module that notifies (`../core/roadmap.md`, Section 1 item 8).

R-49. A link that carries a token is never written to a log at any level, in either adapter, in the template renderer, or in a job retry (`DEC-31`, `../core/roadmap.md`, Section 0 item 10).

### Job queue

R-50. Background jobs run on pg-boss in the deployment's own database, in its own schema. One worker process runs from the same image, selected by an entrypoint flag, so the stack is the application container, the worker container, and Keycloak (`DEC-12`, `DEC-33`, `../runbooks/deployment.md`, "The shape of one deployment").

R-51. The worker builds one tenant context at startup, exactly as the application does, and passes it into every handler. A job handler reads through `ctx.tenant` and never opens its own connection (`DEC-34`, `../architecture/module-contract.md`, "What a module declares", Jobs).

R-52. Core exposes `enqueue(job, data, options)` and schedules to modules, and the worker runs a module's declared handlers. The placeholder module gains the jobs contract point in this section (`../architecture/module-contract.md`, Jobs, `../core/roadmap.md`, Section 0 item 3).

### Event bus and capabilities

R-53. Core ships a typed event bus with `emit(event)` and `on(event, handler, { serializeBy? })`. A fast handler runs in process. A slow or retryable handler runs as a pg-boss job (`../core/roadmap.md`, Section 1 item 9a, `../architecture/module-contract.md`, "What core provides to a module").

R-54. An event is emitted after the emitting transaction commits, never inside it, so a handler never observes a row that a rollback removed (`../architecture/module-contract.md`, "How modules talk to each other").

R-55. Delivery is at least once and unordered. Every handler is idempotent and tolerates an older event arriving after a newer one (`../architecture/module-contract.md`, "How modules talk to each other").

R-56. A subscription that cannot tolerate that passes `serializeBy`, a function from the payload to a key. Core then runs the jobs for one key one at a time in creation order, while jobs for different keys run in parallel. The mechanism is one pg-boss queue per serialized subscription, created with the `key_strict_fifo` policy, and the key passed as `singletonKey` on every send, which the policy requires. The policy blocks every later job for a key while any job with that key is active, in retry, or failed, so a permanently failed job holds its key until an operator retries or deletes it, and the worker exposes `getBlockedKeys()` for that queue in its log at error level with the dead-letter move (`../architecture/module-contract.md`, "How modules talk to each other", `../core/tech-stack.md`, "Data", the pg-boss row). Serialized jobs are enqueued at the default priority.

R-57. Every serialized queue declares a pg-boss dead-letter queue, created before it is referenced, because a job that exhausts its retries on a serialized key blocks every later job for that key. The worker logs a move to a dead-letter queue, and the runbook's recovery table already names the operator action (`../architecture/module-contract.md`, "How modules talk to each other", `../runbooks/deployment.md`, "Recovery by scenario").

R-58. Core ships `provide(name, implementation)` and `capability(name)` for the capabilities channel. `capability(name)` returns the provider or nothing, and every consumer behaves when the answer is nothing, because the providing module may be disabled or absent from the image (`../architecture/module-contract.md`, "How modules talk to each other", channel 3).

R-59. An event that a second module subscribes to, and every capability interface, is declared in `packages/core/contracts` with its name, zod schema, and version, and both sides import it from there. That folder imports only zod and TypeScript types, enforced by the oxlint `no-restricted-imports` rule. An event payload schema is versioned and never changes shape in place (`DEC-42`).

R-60. Modules never call each other. A module emits, and core delivers. If the emitting module is disabled or absent from the image, the event never fires (`../architecture/module-contract.md`, "How modules talk to each other").

R-61. The placeholder module gains the events and capabilities contract points in this section and exercises both channels: one event with a fast in-process handler, one event with a pg-boss handler, and one serialized subscription. No shipped module provides a capability yet (`../core/roadmap.md`, Section 1 item 9a and Section 0 item 3).

### The `genie-ops` command line

R-62. `genie-ops` ships inside the image and runs through `docker compose exec` or as a second entrypoint, so a customer-managed deployment holds it without installing anything (`DEC-14`, `DEC-33`).

R-63. One runner parses the command, builds the tenant context, runs the command, and writes the audit row of R-64 around it. A command never builds its own connection (`DEC-34`, `DEC-45`).

R-64. Every command run writes exactly one `audit_event` row through one helper in the runner: `actor_user_id` null, `action` set to `ops:<command>`, and `metadata` carrying the operating-system user name, the non-secret arguments, and the outcome. The helper is the one place a command touches `audit_event` (`DEC-45`).

R-65. A command that fails writes the same one row with a failing outcome. A command that cannot write a row, because the database or the table does not exist yet, or because the row would outlive the database, writes to the command output instead. In this section those are the `migrations` step of setup before the table exists, and the final delete of `genie-ops retire --confirm` (`DEC-45`, Trade-off).

R-66. No secret and no generated password is ever written into `metadata`, into a log, or into any file. The bootstrap Keycloak credential that Section 2's realm step reads is never written to `.env`, to a file under `customers/<slug>/`, or to a log (`DEC-37`, `DEC-45`).

R-67. The commands that land in this section are `setup`, `module enable|disable`, `migrate`, and `retire`, on the runner of R-63 (`../core/roadmap.md`, Section 1 item 10, `DEC-14`).

R-68. `genie-ops module enable|disable <module-id>` writes `tenant_module.enabled` through one core procedure. The Modules page of Section 3 item 11 calls that same procedure, so the command line and the screen cannot diverge. The command refuses a module id that is not compiled into the image, because an entitlement can only switch on a module the image carries (`DEC-50`, Guard, `DEC-46`).

R-69. `genie-ops retire` writes the single `retirement` row with `retired_at` and leaves the data in place. It records the date and nothing more. The operator stops the stack, because a command inside the container cannot stop its own stack (`../core/roadmap.md`, Section 5 item 7). The refusal rules land here too: `genie-ops retire --confirm` refuses before 90 days have passed since `retired_at`, and refuses while `deletion_hold` is set. Nothing runs on a schedule. The deletion that `--confirm` performs after the hold, the placing of the hold, and personal erasure land in Section 5 item 7 (`DEC-17`, `../architecture/data-shape.md`, "Deployment tables", and the two `genie-ops retire` rows of `../specs/README.md`, "Cross-section calls made in the drafting round").

R-68a. The shared UI/CLI enable procedure validates the module's declared required configuration before activation. Invalid or missing required values leave it disabled and return actionable validation errors. Authorized core administration must allow pre-enable configuration without opening disabled module-owned routes. Valid configuration alone does not enable it; a module without required configuration still requires explicit enablement. Successful activation uses existing role/admin-key rules without assigning ordinary access. Retained whole-module grants cover future records only within their module. Newly introduced disabled modules start no module business work in app or worker processes. In-flight cancellation for previously enabled modules remains a separate lifecycle decision.

### The public address

R-70. `PUBLIC_URL` is the one public address of the deployment. Cookies, authentication callbacks, email links, and tokenized download links derive from it. The application never inspects the request hostname, and no second copy of the address exists in `tenant.yaml` or in the database (`DEC-19`, `DEC-35`, `../architecture/environment-contract.md`, "Required").

R-71. The reverse proxy in front of the stack owns the certificate. Nothing in the image terminates TLS or knows which hostname the proxy serves (`DEC-19`).

### Isolation

R-72. Every read this section adds reaches the database only through the tenant context. The standing two-context isolation test of Section 0 item 3a gains the readers of R-5 and the file store of R-6, and proves that each context's readers cache and serve their own database (`DEC-34`, `DEC-46`, Guard).

### Cross-cutting rules

R-73. One Drizzle pool over node-postgres is built at startup inside the tenant context and is never exported. The application, the worker, and `genie-ops` each build one, and each passes it no further than the context object. A router procedure, a job handler, a page, and a command all read `ctx.tenant.db` (`../core/roadmap.md`, Section 1 item 3, `DEC-34`).

R-74. Every migration this section writes is expand-then-contract: it adds or widens, and a later release removes. Every release must be a valid upgrade from the last three, because a customer-managed deployment can lag (`DEC-9`, `DEC-43`, `../adr/0007-one-deployment-per-customer.md`, "Consequences"). R-13 is the lint that guards the rule, and it does not replace the reviewer's check that a contract migration lands at least one release after its expand.

R-75. The worker, the migrator, and `genie-ops` write the same pino JSON lines as the application, with the request id where one exists and the tenant id on every line, at the level from `LOG_LEVEL`. No secret, session token, generated password, or emailed link ever reaches a log line, in any of the four (`DEC-31`, `../core/roadmap.md`, Section 0 item 10).

R-76. A `genie-ops` command exits zero on success and non-zero on failure, and prints the cause on the failing path, so an operator following `../runbooks/deployment.md` and any later automation both read the same signal (`DEC-38`).

R-77. A step of `genie-ops setup` writes its `setup_step` row outside the transaction that does the step's work, so a failed transaction still leaves a `failed` row with its detail. A step whose work spans several tables does that work in one transaction, so a failure leaves no partial seed (R-20).

R-78. `tenant.yaml` carries only the values `../architecture/repository-layout.md` names for it. A setting the file does not carry takes the default recorded in `../architecture/data-shape.md`, "Tenant settings": `onboarding_mode` `invite`, `local_accounts_enabled` false, `session_idle_minutes` 15. No default lives in two places (`DEC-35`).

R-79. The entitlement reader answers only for compiled modules. Before serving requests or consuming jobs, upgrade/startup rejects omission of a previously installed module unless the controlled removal requirements in [Module removal and reintroduction](../architecture/module-removal.md) are implemented, tested and durably completed for that module. A disabled row or changed include list is insufficient. The check counts a module as installed when its `tenant_module` row exists or its migration ledger table `drizzle.__drizzle_migrations_<id>` exists. Core's own ledger `drizzle.__drizzle_migrations` never matches. A module with neither is not installed. The check reads the id from the table name, because the image that omits a module cannot read its declaration, so the module contract fixes that name (R-9). It strips the prefix and writes underscores back as hyphens. Module ids are kebab-case and never contain an underscore, so each name maps back to exactly one id. The ledger counts because the app migrates at start, before setup, so a first boot with the wrong image leaves a module's tables and ledger without a row. The check then refuses, names the module and deletes nothing, and the operator restores the right image or, for a deployment that never went live, recreates an empty database (DEC-50, Registration reconciliation owner, amended 2026-09-23, [diagram](../architecture/diagrams/module-omission-check.html)). Until that workflow is available, reject such removal. After authorized removal, retained historical rows grant nothing, the registry exposes no module routes, and R-68 refuses enabling an uncompiled module. Never delete historical state as reconciliation cleanup (DEC-46, DEC-33, DEC-50).

R-80. While the setup gate is unsatisfied, the health endpoint and the static assets the not-set-up page needs still serve. Nothing else does. No tRPC procedure, no module route, no inbound endpoint under `/api/m/`, and no authentication route answers, so an unfinished deployment exposes no surface (`../core/roadmap.md`, Section 1 item 2, `DEC-31`).

R-79a. Reintroduction of a removed module follows CF-MA-11 and the [removal policy](../architecture/module-removal.md): validate stable identity and compatible history, apply supported migrations, preserve retained configuration/assignments, and leave it disabled regardless of past activation. Both UI and CLI enable paths require administrator review/confirmation of retained grants and valid required configuration. Reinstallation never revives revoked credentials or cancelled work.

## Acceptance criteria

AC-1 (roadmap item 1). An integration test against a Testcontainers Postgres applies the core history and asserts that each table of R-1 exists with its documented columns, that `category` and `user_preference` do not exist, that every column of R-2 and `tenant_module.category_id` is nullable and carries no foreign key, and that the `file_blob` bytes column has external storage. A second test asserts that a settings, branding, or entitlement read served from a filled cache does not query the database, and that a read after 10 seconds does. Proves R-1, R-2, R-3, R-5.

AC-2 (roadmap item 2). An end-to-end test boots a deployment with the core history applied and no `setup_step` rows, opens three different routes, and sees the not-set-up page on each, with the two known steps listed. The health endpoint answers `degraded`. After both steps are `done`, the same routes render normally and the endpoint answers `ok`. Proves R-11, R-14, R-15, R-16.

AC-3 (roadmap item 3). A lint run fails a fixture file outside core that imports `pg`, `drizzle-orm/node-postgres`, or core's connection module. A unit test asserts that core's public entry point exports no database, settings, branding, entitlement, or storage value. An integration test asserts that the application, the worker, and a command each open one pool and that the count of server connections matches. Proves R-7, R-73.

AC-4 (roadmap item 4). An integration test runs `genie-ops migrate` twice against one database and asserts that the second run applies nothing and fails nothing. A log assertion proves the pending count line is written before the first migration is applied. A pipeline test proves the Squawk job fails a migration that drops a column and passes the same file with a `squawk-ignore` comment, and that `drizzle-kit check` fails a history with two migrations at the same index. Proves R-9, R-10, R-13.

AC-5 (roadmap item 5). An integration test runs `genie-ops setup` against a fresh database and asserts that `migrations` ran before `seed`, one `tenant_module` row per compiled module written by the `seed` step, one `tenant_settings` row matching `tenant.yaml`, one `tenant_branding` row matching `branding.seed.json`, both `updated_by_user_id` columns null, and both steps `done`. A second run changes nothing. A third case injects a failing `seed` step and asserts the row is `failed` with a detail, that `migrations` stays `done`, and that a rerun resumes at `seed`. A fourth case puts the company name in `tenant.yaml` and asserts the command fails naming the key and the file. Proves R-18, R-19, R-20, R-21, R-22, R-24, R-26.

AC-6 (roadmap item 5, schema emission). A continuous integration check runs `nx run core:schemas` and fails when the files under `deploy/schemas/` differ from the committed ones. A unit test asserts that the emitted JSON Schema of each file carries `additionalProperties: false`. Proves R-23.

AC-7 (roadmap item 6). Against a fresh database, the smoke test of R-31 boots a customer image from its generated compose file with one module left out of the include list, asserts the application serves, asserts that none of the excluded module's tables exist, and asserts that each of its routes answers as an unknown route. A generator test asserts that `nx g @genie/generators:tenant-new` writes all seven files of R-29. An integration test with a compiled module whose entitlement is off asserts that its navigation entries are hidden, that its routes and procedures refuse rather than answer as unknown, and that its tables still exist, so the two cases are distinguishable. Proves R-8, R-28, R-29, R-30, R-31.

AC-8 (roadmap item 7). Integration tests prove seven things. Bytes stored through `FileStorage` land in `file_blob` and come back unchanged. An upload one byte over `FILE_MAX_BYTES` is refused. A type outside the allow-list is refused. An SVG carrying a script tag, an `onload` attribute, and an external `xlink:href` is stored with all three removed. An SVG that is empty after sanitizing is refused. A download link is refused after it expires. Every new `file` row carries `scan_status` `skipped`. A startup test asserts that `FILE_MAX_BYTES` above the default fails validation on the `postgres` adapter and passes on `s3`. A lint or unit check asserts that no file outside the adapters references `file_blob`. Proves R-32 to R-39.

AC-9 (roadmap item 7a). An integration test writes a `tenant_integration` row with a `secret_ref`, resolves it through the core service with the named environment value present, and asserts that the returned object carries the configuration and the live secret and that the stored row holds no credential. A second case asserts a clear failure when the named secret is absent. Proves R-40, R-41. A repository check asserts that core ships no integration page component, proving R-42.

AC-10 (roadmap item 8). Unit tests render every template in the catalogue and assert both an HTML part and a plain-text part. Integration tests prove that with `MAIL_PROVIDER` unset in production an action that must send an email fails before it writes a row, and that in development the link is logged. A log assertion proves no tokenized link reaches the log in production at any level. An integration test runs `genie-ops setup` with no mail variables set and completes. Proves R-43, R-44, R-45, R-46, R-48, R-49. R-47 is proved in Section 2 with the local-accounts realm.

AC-11 (roadmap item 9). An integration test starts the worker entrypoint against a Testcontainers Postgres, enqueues a placeholder job, and asserts the handler ran with a tenant context whose reads land in that database. A container test asserts the worker and the application come from the same image and differ only by the entrypoint flag. Proves R-50, R-51, R-52.

AC-12 (roadmap item 9a). Integration tests prove six things. An event emitted inside a transaction that rolls back is never delivered. An event emitted in a committed transaction reaches a fast in-process handler and a pg-boss handler. A handler that runs twice on one event leaves the same result. Three events with one `serializeBy` key run one at a time in emission order while a fourth event with a different key runs in parallel. A serialized job that exhausts its retries lands in the declared dead-letter queue and the later jobs for that key stay queued. `capability()` returns nothing when no module provides the name. A lint test fails a file in `packages/core/contracts` that imports anything but zod or a type. Proves R-53 to R-61.

AC-13 (roadmap item 10). A command-line test suite runs each of `setup`, `module enable`, `module disable`, `migrate`, and `retire`, and asserts exactly one `audit_event` row per run, with `actor_user_id` null, `action` equal to `ops:<command>`, and the operating-system user, the non-secret arguments, and the outcome in `metadata`. A failing run writes one row with a failing outcome. A test asserts that `module enable` on a module that is not compiled in is refused, and that the command and the core procedure write the same row. Proves R-62 to R-69.

AC-14 (roadmap item 11). A test asserts that a callback URL, an email link, and a tokenized download link are all built from `PUBLIC_URL` and that changing the request `Host` header changes none of them. Proves R-70, R-71.

AC-15 (done when: a customer image boots from its generated compose file and shows the not-set-up page). The smoke test of AC-7 continues: after the stack is up and before setup runs, the root route renders the not-set-up page and the health endpoint answers `degraded`. Proves R-11, R-15, R-16, R-28, R-29.

AC-16 (done when: `genie-ops setup` completes and clears it). The same test runs `genie-ops setup` in the running stack, asserts both steps `done`, and asserts the root route no longer renders the not-set-up page and the health endpoint answers `ok`. Proves R-15, R-18, R-19, R-20, R-26.

AC-17 (done when: every `genie-ops` command run leaves one `audit_event` row). The command-line suite of AC-13 asserts one row per run across every command in R-67, and asserts that the two cases of R-65 that cannot write a row write to the command output instead. Proves R-64, R-65, R-67.

AC-18 (cross-cutting rules). A log assertion over one run of the application, the worker, the migrator, and each command proves the redaction list holds and that a tenant id is present on every line. A command test asserts the exit code on a success and on a failure. An integration test injects a failure inside the `seed` transaction and asserts a `failed` row with a detail and no partially written settings or branding. A unit test asserts each default of R-78 when `tenant.yaml` omits the value. An existing-database upgrade test omitting an installed module without completed removal evidence asserts startup refuses before requests/jobs and preserves history. Once controlled removal is implemented, a completed-removal fixture proves historical rows grant nothing, the registry ignores the absent module and `module enable` refuses it. An end-to-end test before setup asserts that the health endpoint answers, that the not-set-up page renders, and that a tRPC call, a module route, and an inbound endpoint under `/api/m/` do not. Proves R-74 through R-80. R-74 itself is proved by the Squawk job of AC-4 plus the reviewer check it names.

AC-19 (done when: a second stack of the same image with a different database shows none of the first stack's data). The standing two-context isolation test builds two tenant contexts against two Testcontainers databases in one process, seeds different settings, branding, entitlements, and a file in each, and asserts that every reader, the file store, and the placeholder module's router serve only their own database. An end-to-end variant boots two stacks of one image against two databases and asserts the same through the running application. Proves R-5, R-6, R-7, R-72.

AC-19a (module lifecycle). Prove R-79/R-79a with the policy's lifecycle matrix on an existing database, including unauthorized removal refusal, retained history, disabled reintroduction, shared UI/CLI checks, failures and concurrent retries. The rejection guard is required before controlled removal is supported; the full matrix is a release gate for adding that support.

## Verification

New-module activation acceptance (R-27/R-68a): upgrade a database with completed setup to an image adding one module. Assert its row is disabled, no ordinary assignments/admin-key append is added for it, and module routes, inbound calls, and worker business work remain blocked. Repeat startup and verify all existing settings/grants/memberships remain unchanged. Missing/invalid configuration makes UI and CLI enable attempts fail without activation; saving valid configuration alone still leaves it disabled. Explicit enablement applies existing role/admin rules without ordinary assignments. Test a module with no required configuration, retained grants after re-enable, and a whole-module solution grant covering a new solution but not an unrelated module. Retain a fresh-setup case proving its initial policy is unchanged. Add a fresh-database case: start the image before setup and assert that no `tenant_module` row exists, then run setup and assert R-20's initial policy. These are required future integration/E2E tests, not executed evidence.


Validate the environment-contract runtime profiles with Section 1 app/worker startup and setup/migrate runs without Section 2 authentication or bootstrap credentials. The command runner starts no listener or worker loop. Provider-specific values are required only for selected, implemented consumers; optional mail and empty chat configuration do not prevent setup. A missing integration `secret_ref` value fails when the resolver is invoked, not during unrelated startup. The Section 2 tests add pending-versus-completed realm-step credential cases.

Extend Section 0 R-19a/R-19b/AC-26 rather than adding a second startup path. Prove the app, worker, and command runner each initialize one process-local context and that the worker accepts no job before migrations succeed. A fresh migrated but unseeded deployment serves the not-set-up page and `degraded` health; context construction must not require existing seed rows. Setup and migrate retain their step/audit lifecycle. Setup completes without a mail provider; schema validation rejects malformed applicable values before connecting. When Section 2 adds realm provisioning, prove the app boots without bootstrap credentials and setup resumes past a completed realm step without them. No test requires a live deployment service during image build.

Unit tests: the tenant-config zod schemas including the wrong-key case, the emitted JSON Schema shape, the SVG sanitizer against a corpus of hostile files, the template renderer's two parts, the setup-gate computation over every combination of missing, `pending`, `failed`, and `done`, the pending-migration counter, and the audit metadata builder including its secret redaction.

Integration tests against a real Postgres through Testcontainers, never a mock: the migration shape, the cached readers and their expiry, `genie-ops setup` including resume and idempotence, the file store end to end, the integration secret resolver, the event bus across both channels including after-commit, serialization, and the dead-letter queue, the worker, each command-line command and its audit row, and the two-context isolation test extended to this section's members.

End-to-end tests with Playwright, each at a phone viewport and a desktop viewport (`DEC-25`): the not-set-up page on several routes with the health answer, the same routes after setup, and the two-stack isolation check. The not-set-up page also passes the axe check, because it is the first page a visitor can reach.

Container and pipeline checks: the smoke test of R-31 from the generated compose file, the staleness check on `deploy/schemas/`, the Squawk and `drizzle-kit check` job, and the lint fixtures for the banned imports and for `packages/core/contracts`.

Manual checks, where no automated layer fits: one operator walks `../runbooks/deployment.md`, "Set up a new customer", steps 1 to 9 against a scratch host and confirms that each step's text matches what the commands do. This is the reference path that `DEC-38` requires to stay complete, and no automation exists to prove it.

## Deferred

- The foreign keys from `tenant_settings.updated_by_user_id`, `tenant_branding.updated_by_user_id`, `audit_event.actor_user_id`, `file.uploaded_by_user_id`, `tenant_api_key.created_by`, and `tenant_integration.created_by_user_id` to `user`. Section 2, in the migration that creates `user`. Trigger: that migration.
- The `realm`, `clients`, `roles`, `admin_seed`, and `break_glass` steps of `genie-ops setup`, and the commands `idp set`, `admin add`, and `break-glass rotate`. Section 2 item 9a, with the tables and the realm they write. A stack set up under this section runs the new steps on its next `genie-ops setup` (R-17). Trigger: Section 2 item 9a.
- The real `can()` and `scopesFor()`. Section 2 item 6 replaces the Section 0 stub. Until then the tokenized download link of R-38 is checked by the stub, which grants only `placeholder:read` (`DEC-34`).
- `rate_limit_window` is created here and written in Section 2 item 4a (`DEC-31`).
- `tenant_api_key` is created here. Issue and revoke procedures arrive with the first module that ships an inbound endpoint, from that module's admin screen (`../architecture/data-shape.md`, "Deployment tables").
- The senders of the mailer catalogue. Section 2 item 8 emits `core:session:new`, `core:role:granted`, and `core:role:revoked`, which send the role and new-device emails and write the `notification` rows. Trigger: Section 2 item 8.
- The Tenant Settings, Branding, Modules, and Categories screens that edit what setup seeds here. Section 3 items 5, 10, and 11 (`DEC-50`, `DEC-51`).
- The `s3` adapter of `FileStorage`, `genie-ops files migrate`, and ClamAV scanning. After the core sections. Trigger: a tenant's file bytes pass a few gigabytes, a customer asks for their own bucket, or a customer requires scanning (`DEC-20`). R-34 keeps the path open.
- The deletion that `genie-ops retire --confirm` performs after the hold, the placing of the deletion hold, and personal erasure. Section 5 item 7. The command, the `retirement` row, and the refusal rules land here (R-69). Trigger: Section 5 item 7 (`DEC-17`).
- The backup rules for the deployment. Section 5 item 3. A deployment with `local_accounts` on must also back up the Keycloak database, because the realm holds the people's passwords and second factors and the template cannot recreate them (`../runbooks/deployment.md`, "Backups", `DEC-10`). Nothing in this section writes those credentials, so the rule belongs to the operations runbooks.
- The audit reader screen and its operator-row filter. Section 2 item 12 (`DEC-45`).
- The automation of setup and upgrade. `OPEN-7`, decided after the platform is ready for its first deployment. This specification chooses no tool. The manual steps in `../runbooks/deployment.md` are the reference path (`DEC-38`).
- A `release` table and a runtime version check. Not built until a customer-hosted deployment is found more than three releases behind (`DEC-43`, Revisit).

Assumptions

- First-time setup retains its initial enabled policy (R-20). A newly introduced module after the `seed` step is done starts disabled pending administrator configuration and explicit enablement (R-27/R-68a; DEC-50 addendum, decided 2026-09-18). Compilation establishes availability, not consent to activate new functionality.
- The health endpoint answers `degraded` with HTTP 200 (R-11). The runbook's step 7 requires a not-set-up container to keep serving so the operator can open `PUBLIC_URL` and see the page, so the container health check must pass while setup is incomplete. A migration failure stays distinguishable because the process never listens at all (R-12). If this is wrong, the not-set-up container is restarted or deregistered by the orchestrator and the runbook step fails.
- The rule of R-2 is applied to every user-referencing column created in this section, not only to the two the roadmap names. `../core/roadmap.md`, Section 1 item 1 names `updated_by_user_id` and `actor_user_id`, and the same reason applies to `file.uploaded_by_user_id`, `tenant_api_key.created_by`, and `tenant_integration.created_by_user_id`, because `user` does not exist yet. If it is wrong, the migration fails at once, so the cost is bounded.
- The local-account variant of the invitation template (R-48) is a Genie-sent notice that the person has been added and that the realm will send a password email, not a credential email. `DEC-10` and `DEC-40` reserve the set-password, reset, and verify emails for Keycloak, so the variant cannot be a credential email, and `../core/roadmap.md`, Section 1 item 8 still names the variant.
- Verified against the current pg-boss documentation (`docs/api/queues.md` on the main branch, read 2026-09-18): the policies are `standard`, `short`, `singleton`, `stately`, `exclusive`, and `key_strict_fifo`, and `key_strict_fifo` requires `singletonKey` on every job and blocks a key while a job with that key is active, in retry, or failed, with `getBlockedKeys()` to list blocked keys, so R-56 matches the library and the sources. An earlier lookup against an older index missed that policy, and the sources were wrongly changed to `singleton` for a few hours on 2026-09-18 before this was caught in review. zod 4 `z.strictObject()` rejects unknown keys and `z.toJSONSchema()` emits `additionalProperties: false` by default, so R-22 and R-23 hold as written. The drizzle-kit `migrate()` migrator reads a migrations folder and a migration history from the database and applies only unapplied files, and `drizzle-kit check` exists and checks history consistency, so R-9 and R-13 hold. DOMPurify accepts `USE_PROFILES: { svg: true, svgFilters: true }` together with `FORBID_TAGS`, and its documentation requires the jsdom factory pattern and the latest jsdom on the server, so R-37 holds. The Resend Node SDK takes `from`, `to`, `subject`, `html`, `text`, and camelCase `replyTo` in one call and accepts an HTML part and a text part together, so R-43 and R-44 hold on that adapter.
- The migration of R-1 is one migration file rather than several. The roadmap names the tables as one work item and they are created before anything reads them, so splitting them buys nothing and costs an extra file in the history that every module's Testcontainers preset replays.
- Not verified: the node-postgres `bytea` behavior that `DEC-44` reasons from. The 15 MB limit and the external-storage rule are taken from `DEC-44` as recorded and were not measured. If the peak heap per upload is worse than the decision assumes, the limit is the one place to change (R-35).
- The `tenant_module` rows in the `seed` step were an assumption in the first draft and are now the recorded reading: `../architecture/data-shape.md`, "Deployment tables", `setup_step`, states that `seed` inserts them right after `migrations` (R-20).
- Three findings of the first draft were fixed in the sources during the integration pass and are no longer open. `../architecture/module-contract.md` and `../core/tech-stack.md` name the pg-boss policy `key_strict_fifo`, which the current library has; a wrong correction to `singleton` was reverted the same day (R-56). The design files for the not-set-up page listed eight steps including `identity_provider`, which `DEC-36` contradicts, and now list the seven `setup_step` names of the data shape (R-14, R-16). `../runbooks/deployment.md`, "Upgrade", did not tell an operator to rerun setup after a release that adds a step, and now does so in step 5 (R-17).

Open questions

- Closed: the SMTP client of R-43 was settled during the integration pass: Nodemailer, now named in `../core/tech-stack.md`, "Communication", and in `README.md`, "Cross-section calls made in the drafting round". The product owner confirmed it at approval on 2026-09-23.
- Open, recorded 2026-09-23: whether the worker process runs the migrator run itself or waits for the app's run, including the registration commit (R-27). Tracked on Bead `genie-ops-center-v2-1ia.8`.
- Open, recorded 2026-09-23: how the entitlement reader of R-5 answers for a compiled module with no `tenant_module` row. By R-20 and R-27 that happens only before the `seed` step is done, when R-16 puts every route behind the not-set-up page, so the open part is a job or schedule the worker runs in that window.
- Open, recorded 2026-09-23: whether the Section 2 `roles` step seeds default role definitions for a module registered disabled before it ran (R-27). No assignment or admin-key append is created for it either way.
