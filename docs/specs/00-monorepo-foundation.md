Confidence: 8.2/10
Reasoning: Every requirement below traces to a roadmap item, a recorded decision, an architecture contract, or a cross-section call in `../specs/README.md`, and the sources now agree on the permission key form, the health endpoint, the release-tag push, the Section 0 smoke test, and the landing-route flag, so the two contradictions that held the first draft down are closed. The score is held below nine because no application code exists, so nothing here is proven by a run, and because five routine implementation choices and the error body shape are settled by the cross-section calls table or under Assumptions rather than by a recorded decision. Several dependency versions in `../core/tech-stack.md` are ahead of what current documentation confirms, and those are listed under Assumptions rather than corrected here.
Status: Approved by the product owner for ticket breakdown, 2026-09-19. Implementation has not started; G1/G2 remain required proof gates.

## Goal and scope

Section 0 delivers the monorepo that every later section builds in: one application that composes core and modules, one Dockerfile that produces one image per customer, and the seams, generators, and test layers that let modules grow without changing core (`../core/roadmap.md`, Section 0 goal).

In scope: the workspace and task graph, the shared configuration package, the module contract types in core, the placeholder module, `createTenantContext()`, the generated module registry, per-history migrations with an advisory lock, the Nx generators, the Docker image and build script, the four test layers including Storybook, the devtools mount, the internationalization scaffold, logging with stable error codes, the security headers, and the continuous integration gates.

Out of scope, and named under Deferred with the item that delivers each: every deployment table, `genie-ops`, the file store, the settings, branding, and entitlement readers, the event bus, the job worker, entitlement and permission filters on the registry, the real `can()` evaluator, the shell, and `ConfigForm`.

Boundary before: none. Section 0 is the first section. Boundary after: Section 1 depends on the tenant context, the migrator, the registry, and the generators delivered here (`../specs/README.md`, Dependencies).

## Sources

| Source | Used for |
| --- | --- |
| `../core/roadmap.md`, Section 0 | Work items 1 to 11, the rules list, and the definition of done |
| `../core/roadmap.md`, Order and parallelism | The boundary with Sections 1 and 2 |
| `../specs/README.md`, Section boundaries | What Section 0 defines and what a later section finishes |
| `../specs/README.md`, Cross-section calls made in the drafting round | The health endpoint, the release-tag push, the Section 0 smoke test, the release-tag matrix, the module admin key, and the landing-route rule |
| `../core/vision.md`, Product principles, Decided | Principles 2, 3, 6, and 8, and `DEC-6`, `DEC-9`, `OPEN-7` |
| `../core/decision-log.md` | `DEC-13`, `DEC-19`, `DEC-22`, `DEC-25`, `DEC-28`, `DEC-31`, `DEC-33`, `DEC-34`, `DEC-35`, `DEC-42`, `DEC-43`, `DEC-46`, `DEC-48`, `DEC-49`, `DEC-50`, `DEC-51` |
| `../architecture/repository-layout.md` | The tree, the three-folder rule, the per-folder `README.md` obligation |
| `../architecture/environment-contract.md` | Required values, `LOCK_TIMEOUT_MS`, `LOG_LEVEL`, `PORT`, `MODULE_INCLUDE` as the only build argument |
| `../architecture/module-contract.md` | Every declaration point and every rule a module must not break |
| `../architecture/data-shape.md`, Rules and Deployment tables | Module table rules, `tenant_module`, identifier and timestamp rules |
| `../core/tech-stack.md` | Every dependency and its stated version line |
| `../adr/0007-one-deployment-per-customer.md` | One deployment per customer, the tenant context seam, the migration order |
| `../adr/0005-tenant-migrations-at-deploy.md` | Migrate before serving, advisory lock, idempotent migrator, expand-then-contract |

## Requirements

### Workspace and task graph (item 1)

**R-1.** The repository must be a pnpm workspace whose packages are `apps/genie`, development-only `apps/storybook`, `packages/core`, `packages/ui`, `packages/config`, `packages/modules/*`, `tools/generators`, and `customers/*/app` when one exists (`../architecture/repository-layout.md`, Layout).

**R-2.** Nx must own the task graph. Tasks must be inferred from each package's `package.json` scripts, so a package stays a plain pnpm package (`../core/tech-stack.md`, Runtime and language). Storybook additionally uses `@nx/storybook` configuration inference with one owner per target and an explicit Vitest-addon test target where needed (R-41a). `nx affected -t build test lint typecheck` and the Storybook targets must run only what a change touches (`../core/roadmap.md`, Section 0 item 1).

**R-3.** Nx local caching must be on. Section 0 must run without a remote cache provider, account or token, with remote caching disabled. Remote caching is deferred until measured cross-machine build costs justify it and its provider, artifact confidentiality, access controls and credential handling are approved (`../core/roadmap.md`, Section 0 item 1).

**R-3a.** Module selection is a semantic cache input. Registry generation and every target whose result depends on that selection, including application build, typecheck, and image preparation, must include `MODULE_INCLUDE` in its cache inputs. A task that reads a customer's `modules.txt` must also include that file's contents in its inputs. The effective selection must be resolved before cache lookup, including when a wrapper reads the list from a file; changing it inside a cached task after lookup is insufficient. Unset (development/CI default) and explicitly empty (no modules) must remain distinguishable. Selection-dependent generated files and outputs must be declared and regenerated or restored for the selected input, never reused as stale artifacts from another selection. These rules apply to local caching now and must also apply to any future approved remote cache; targets with side effects such as publishing an image must not be treated as reusable build outputs.

**R-4.** Every project must carry exactly one architectural classification tag: `app` for `apps/genie`, development-only `apps/storybook`, and any `customers/<slug>/app`, `core` for `packages/core`, `ui` for `packages/ui`, `module` for every package under `packages/modules/`, `config` for `packages/config`, and `tooling` for `tools/generators`. The first four are product layers; config and tooling classify development infrastructure, not additional product layers. Other unrelated metadata tags are not prohibited. The project graph must expose these classifications; tags do not enforce import boundaries by themselves (`../core/tech-stack.md`, Runtime and language).

### Shared configuration and import bans (item 2)

**R-5.** `packages/config` must own the shared `tsconfig`, the oxlint configuration, the oxfmt configuration, the Tailwind preset, the Vitest preset, and reusable Storybook configuration. Every other package must extend them and must not restate a rule.

**R-5a.** Incorporate [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) into the shared Oxlint configuration. Upstream distributes vendorable source, not an official npm package: copy a reviewed, identified revision into the shared configuration package, retaining licenses, provenance and local modifications. Pin `oxlint` and `@oxlint/plugins` to the same exact compatible version and verify plugin loading against that toolchain. Review the generic rules for adoption; document narrowly justified exceptions for legitimate boundary validation, framework contracts and test fixtures rather than weakening types or changing behavior merely to satisfy lint. Effect-specific rules remain off unless Effect adoption is separately approved. Preserve existing import-boundary enforcement; this plugin does not approve the deferred experimental Nx bridge. Keep the plugin development-only and out of customer runtime images. Upstream updates must preserve reviewed local policy, not overwrite it blindly.

**R-5b.** Extend AC-2 with positive/negative fixtures proving the adopted anti-slop rules execute through the shared Nx lint target and staged-file hook, rule failures reach CI, existing boundary checks still fail forbidden imports, and lint/oxfmt converge without repeated formatting changes. Record the enabled rules, exceptions, upstream revision and exact compatible dependency versions. Compatibility and rule suitability must be proved during implementation; this specification records planned integration, not an installed plugin or passed tests.

**R-6.** The toolchain must be Node 26, TypeScript in strict mode, oxlint, oxfmt, and lefthook. The Dockerfile base image and the root `engines` field must name the same Node major (`../core/tech-stack.md`, Runtime and language).

**R-7.** The oxlint `no-restricted-imports` configuration in `packages/config` must enforce the import direction with one `overrides` entry per layer, keyed by file glob (`DEC-6`, `../core/roadmap.md`, Section 0 rules):

| Layer, by glob | Banned import patterns |
| --- | --- |
| `packages/ui/**` | `@genie/core`, `@genie/modules/*`, `apps/*` |
| `packages/core/**` | `@genie/modules/*`, `apps/*`, `customers/*` |
| `packages/core/contracts/**` | everything except `zod` and type-only imports (`DEC-42`) |
| `packages/modules/*/**` | every other module package, `apps/*`, `customers/*` |
| everything outside `packages/core/**` | `pg`, `drizzle-orm/node-postgres`, and core's internal connection module (`DEC-34`) |

**R-7a.** Extend R-7 with development-infrastructure boundaries. `packages/config` imports no other internal project. Package configuration files may consume its shared presets, but product runtime source must import neither config nor tooling. `tools/generators` may consume config and explicitly exposed, side-effect-free core schema/type entrypoints needed by generation, including the tenant-configuration schemas of R-31; it must not import the core runtime entrypoint, application/module implementations, database drivers, or connection internals. Keep the schemas owned by core and shared with Section 1 setup, not copied into tooling. Importing a permitted schema must not parse deployment environment values or initialize services. UI remains the owner of design tokens; styling presets must not introduce config-to-ui imports or a second token definition.

Apply these rules to executable source, tests, package subpaths, and cross-package relative imports, not merely one package-root spelling. Template text that generates an import is not an executable dependency of the generator; generated output must pass the destination package's rules. A generated module is tagged `module`, and a custom app is tagged `app`. The shipped `genie-ops` CLI is runtime app composition, not development tooling. Allowed config/schema imports remain visible dependencies for affected-task and cache invalidation; no blanket tooling exemption from lint or dependency tracking is permitted.

**R-8.** lefthook must run oxfmt and oxlint on staged files in a pre-commit hook (`../core/tech-stack.md`, Testing and quality).

**R-9.** Every folder named in the tree of `../architecture/repository-layout.md` must hold a `README.md` that says what the folder is for, what belongs in it, and what must not go in it. A package folder's `README.md` must also name what it imports. The file must never list the folder's files. Continuous integration must fail a package folder without one (`../architecture/repository-layout.md`, Layout).

**R-10.** Inside `packages/core/src/` and inside every module's `src/`, code must go to `lib/<name>/` for a mini-package with its own API, to `utils/` for a small stateless helper after the standard library and es-toolkit were checked, and to `services/<name>/` for work the application does (`../architecture/repository-layout.md`, Layout).

### Module contract types and the placeholder module (item 3)

**R-11.** Core must export one `Module` type that carries a typed field for every point in `../architecture/module-contract.md`: identity, schema, router, permission keys, record types, default roles, navigation, pages, category assignment, configuration schema, events, capabilities, jobs, inbound endpoints, integration kinds, content security policy, and tests. Section 0 must define the type of every point. Points whose runtime arrives later must be declaration-site only, with no core service behind them yet.

**R-12.** Point types must hold these shapes, and no other point may be added without extending `../architecture/module-contract.md` in the same change (`../architecture/module-contract.md`, How the contract grows):

| Point | Section 0 type | Runtime in Section 0 |
| --- | --- | --- |
| Identity | `{ id: string, displayName: string, version: string }`, `id` kebab-case | Yes |
| Schema | a Drizzle schema module plus a migrations folder path and a migrations table name | Yes |
| Router | one tRPC router | Yes, mounted under the module id |
| Permission keys | `{ key: "<id>:<action>", label: string }[]` | Declared, read by the stub loader |
| Record types | `{ type, parentTypes?, resolve(id) => { label, path?, parents? } }[]` | Declared, resolver called by tests |
| Default roles | `{ name, permissions: string[] }[]` | Declared only, seeded in Section 2 |
| Navigation | `{ pinned: Entry[], entries: Entry[] }`, where `pinned` is ordered and holds at most six entries, and `Entry` carries `categoryId?`, `requiredPermission`, and a landing-route flag on at most one workspace entry (`DEC-49`, `DEC-51`, `../architecture/module-contract.md`, Navigation row) | Declared, rendered unfiltered |
| Pages | page components for workspace and admin | Yes |
| Category assignment | Optional module-owned `listAssignable` and per-record assign/clear contribution using tenant/caller context and safe record descriptors, under the canonical Category assignment boundary | Declaration and contract tests only; runtime in Section 3, Solutions provider in Section 4 |
| Configuration schema | Optional `configSchema`, a zod object limited to five field kinds (`DEC-28`), plus stable section/field metadata, optional search keywords and an optional additional section permission under Settings discovery and authorization | Declared, contract test only; navigator/search and real authorization in Section 3 |
| Events | `{ name, version, payload: ZodType }[]` | Declaration-site only |
| Capabilities | providers named against `packages/core/contracts` | Declaration-site only |
| Jobs | `{ name, schedule?, handler(ctx, data) }[]` | Declaration-site only |
| Inbound endpoints | route handlers under `/api/m/<id>/...` | Declaration-site only |
| Integration kinds | `string[]` | Declaration-site only |
| Content security policy | Optional `contentSecurityPolicy: { frameOrigins(ctx: { tenant: TenantContext }): Promise<readonly string[]> }`, governed by the canonical provider rules | Yes, server-only provider consumed before response headers are emitted |
| Tests | the shared presets a module must use | Yes |

**R-13.** Core must ship a stub `can(user, permission, resource?)` and a stub `scopesFor(user, permission)` with the final signatures. Both must read through one lazy per-request loader built on the request, so that replacing the stub in Section 2 item 6 changes the loader and nothing that calls it (`DEC-48`). The stub loader must hold exactly one granted key, `placeholder:read`, and must refuse every other permission (`DEC-34`, `../core/roadmap.md`, Section 0 item 3). No test-only principal and no read without a permission may exist (`DEC-34`).

**R-14.** The tRPC context builder and the page loader must each build one loader per request. The job worker must build one per job run (`DEC-48`).

**R-15.** The placeholder module must exist at `packages/modules/placeholder`, must never be added to a customer's include list, and must declare:

- Identity: id `placeholder`, display name `Placeholder`, a version string.
- Schema: one table, `placeholder_record`, with a UUID primary key, a `label` text column, `created_at`, and `updated_at` (`../architecture/data-shape.md`, Rules 4 and 5).
- Router: one read procedure, mounted at the tRPC path `placeholder.read`, that calls `can(user, "placeholder:read")` first and then reads `placeholder_record` through `ctx.tenant.db` (`DEC-34`). The permission key is `placeholder:read`, in the `<id>:<action>` form the contract fixes. The dot in the procedure path is a tRPC router path and is not the key.
- Permission keys: `placeholder:read`, `placeholder:use`, and `placeholder:admin`. The module declares a workspace entry, so it must declare `placeholder:use` and require it on that entry (`DEC-50`). It declares an admin page, so it must declare `placeholder:admin`, the key that enabling the entitlement appends to `Tenant administrator` and disabling removes, which Section 2 item 6 tests against this module (`../architecture/module-contract.md`, Permission keys row, `DEC-23`, `../specs/README.md`, Cross-section calls, Module admin key).
- Default roles: `Placeholder user`, carrying `placeholder:use` (`DEC-50`).
- Record types: `placeholder-record`, with a resolver from id to `{ label, path }` and no parent types.
- Navigation: three workspace entries, one carrying a `categoryId` that exists, one carrying none, and one carrying a `categoryId` that no longer exists, so the guard of `DEC-51` has a case for each, plus an ordered `pinned` list. No placeholder entry carries the landing-route flag. Section 0 ships no landing module: a synthetic two-module fixture proves the duplicate-flag rejection of R-23a without compiling solutions. Section 3 implements shell landing selection and its no-grants fallback; Section 4 introduces the solutions hub's landing entry. Keeping the placeholder unflagged also permits a later development/CI build to include it beside solutions (`DEC-49`).
- Pages: one workspace page and one admin page.
- Configuration schema: a zod object with one field of each of the five kinds, string, number, boolean, enum, and string list (`DEC-28`).
- Content security policy: `contentSecurityPolicy.frameOrigins` returns one fixed HTTPS origin, contributed to `frame-src` through the canonical provider contract (`DEC-31`).
- Tests: unit tests, integration tests for the router and the schema, factories for `placeholder_record`, and one end-to-end main path test (`../architecture/module-contract.md`, Tests row).

**R-15a.** The module contract test must assert that the placeholder module declares `placeholder:use` on every workspace entry and declares `placeholder:admin` beside it, so that a module which ships an admin page without the admin key fails at build time (`../architecture/module-contract.md`, Permission keys row, `DEC-23`, `DEC-50`). The same test must reject a navigation tree whose `pinned` list holds more than six entries (`../architecture/module-contract.md`, Navigation row).

**R-15b.** Contract tests must typecheck the CSP provider with the supplied `TenantContext` and exercise the canonical provider rules: omitted and empty providers contribute nothing, duplicate origins are deduplicated, and invalid origins or provider failures never broaden the policy. The module generator must include a typed empty provider; the placeholder's fixed-origin provider proves the runtime path (`../architecture/module-contract.md`, Content security policy provider).

**R-16.** A module must not import another module, must not import a database driver, must not import from `apps/*`, and must not check a permission anywhere except `can()` or filter a list anywhere except on `scopesFor()` (`../architecture/module-contract.md`, What a module must not do). R-7 must make each of these a lint failure where an import string can express it.

### Tenant context (item 3a)

**R-17.** Core must export `createTenantContext()` and the `TenantContext` type, and must export no `db`, `settings`, `branding`, or `storage` singleton (`DEC-34`).

**R-18.** In Section 0 the `TenantContext` must hold fixed members only: the Drizzle pool over `pg`, and the validated environment values the image reads (`../specs/README.md`, Section boundaries). The type must be open to the changing members that Section 1 adds as readers with a 10 second expiry (`DEC-46`).

**R-19.** The application's runtime bootstrap must call `createTenantContext()` once through `apps/genie/src/context.ts` and pass that context into tRPC and pages. Importing this file must not initialize the context. The Section 1 worker and command runner each construct their own context once in their own process; no object or pool is shared across processes. Concurrent request access must reuse the initialized application context, not create additional pools. Core exports the factory, never a global context or connection; custom apps use the same seam (`DEC-34`, Section 1 R-51/R-63/R-73).

**R-19a.** Build and runtime are separate phases. Registry generation, typechecking, Next compilation, and image assembly must work with deployment runtime variables absent and no deployment database or identity service reachable. Environment schema definitions and module declarations are safe to import; parsing deployment values, creating a tenant context, opening connections, and running migrations happen only in an explicit runtime bootstrap. Tenant-dependent pages, metadata, and branding must not be evaluated into build output. Static assets, fixed design tokens, and bundled fonts remain buildable without tenant data. Do not introduce dummy secrets, a build database, a second deployment-value source, or a public client-side environment copy to make the build pass.

**R-19b.** Runtime bootstrap dispatches the selected entrypoint, validates its applicable environment, constructs its context, and awaits the migration gate before the application listens or the Section 1 worker consumes jobs. Validation failure precedes any database connection; bootstrap failure exits nonzero without accepting work. Do not initialize table-reading services before migrations complete. `setup` and `migrate` use the same migrator through their existing command/step lifecycle, not an extra migration pass that bypasses setup tracking or command auditing. Schema readiness is separate from customer setup: Section 1 must still serve its not-set-up page and `degraded` health before setup completes, and setup commands must remain runnable then.

Validation follows the environment contract's entrypoint, command-step, and selected-provider conditions. It must not require the realm bootstrap credential from the app/worker, require it again after the realm step is complete, or make optional mail/chat services mandatory. Validate configuration shape before connecting; do not require an already-provisioned realm as a prerequisite to serving the not-set-up page. Later sections extend this bootstrap without moving initialization into imports. The Section 1 changing readers retain their 10 second expiry, Section 2 auth is runtime-owned, and Section 3 branding stays request-bound. Section 0 implements only its existing runtime members; later services are not pulled forward.

The environment contract's validation profiles are authoritative: Section 0/1 do not require later authentication credentials, and the migrator never requires sign-in credentials. A CLI invocation starts neither a listener nor a job loop. Pre-connection validation covers the selected runtime's requirements; conditional setup-step credential presence is checked after discovering pending steps and before executing the relevant step, preserving resumability. Dynamic integration secrets retain the Section 1 call-time resolver.

**R-20.** One integration test in the app test harness (`apps/genie/testing`) must build two tenant contexts against two Testcontainers Postgres databases in one process, apply the same migration histories to both, seed a distinct `placeholder_record` row in each, and run the placeholder router's read procedure through each context. The app harness composes generic helpers from `packages/core/testing` with the placeholder router and module-owned factories; core must not import the module for this test. It must assert that each read returns only its own database's row, and that no code path reaches the other database. The test must never be skipped, and continuous integration must fail when it does not run (`DEC-34`, enforcement item 3).

### Module registry (item 4)

**R-21.** `apps/genie/src/modules.ts` must be generated from `MODULE_INCLUDE`, gitignored, never committed and never edited by hand. Commit declarations, selection inputs and generator logic instead. Generation must precede consuming builds/typechecks. Clean-checkout CI proves deterministic generation and correct selection, not agreement with a committed generated registry. Repeated identical inputs produce identical output. Concurrent customer builds use isolated workspaces/output roots or container contexts (ADR 0008). The default value is every module, for development and continuous integration only. Every customer build must pass an explicit list (`../architecture/environment-contract.md`, Build argument).

**R-22.** An excluded module must have no import, route, schema or migration files in the build/image (`DEC-33`, `DEC-22`). A fresh database creates none of its tables or applied migration history. Exclusion never purges state from an existing database: [module removal policy](../architecture/module-removal.md) and Section 1 R-79 require rejecting omission of a previously installed module until controlled removal is implemented, tested and completed. Foundation must preserve this later startup guard without implementing the lifecycle here.

**R-23.** The registry must register the included modules, mount each router under the module id, and expose the merged navigation with no filter. The entitlement filter joins in Section 1 item 1 and the permission filter in Section 2 item 6 (`../specs/README.md`, Section boundaries).

**R-23a.** At most one navigation entry across all compiled modules may carry the landing-route flag. The registry generator must fail the build when two modules in one include list declare it (`DEC-49`, `../specs/README.md`, Cross-section calls, Landing route). The check must be proven by a unit test over a two-module fixture, because no module shipped in Section 0 declares the flag. What the shell does when no entitled module declares one is Section 3 item 4.

### Migration histories and the migrator (items 4b and 5)

**R-24.** Core and every module must each own a drizzle-kit migration folder and its own migrations table. Core's table is `__drizzle_migrations`. A module's table is `__drizzle_migrations_<module>` (`DEC-33`, Migration histories).

**R-25.** At container start the image must validate the environment before it opens any database connection, connect, take one advisory lock, apply the core history, then apply each included module's history in registry order, release the lock, and only then serve (`../adr/0005-tenant-migrations-at-deploy.md`, `DEC-9`).

**R-25a.** Core's migrator must reserve one dedicated node-postgres client for the whole run. Lock configuration, acquisition of the session-level advisory lock, every core/module migration history (including migration-ledger reads and writes), and unlock must use that same database session. Bind the Drizzle migrator to that client, not to a pool that can dispatch statements to other sessions. Keep the lock across transaction boundaries between histories. Connection loss aborts the run; do not reconnect and continue migrations without acquiring the lock again through a fresh run. No history may begin before the lock is held.

**R-26.** The advisory lock must use one fixed 64 bit key for the whole application. The migrator connection must set a lock wait limit from `LOCK_TIMEOUT_MS`, default 120000 milliseconds, and must fail loudly with a stable error code rather than wait without end (`../core/roadmap.md`, Section 0 item 5, `../architecture/environment-contract.md`, Optional).

**R-26a.** On success or failure, finish or roll back any active transaction before unlocking on the owning session. Track whether acquisition succeeded so cleanup never assumes ownership after a timeout. Before returning a client to the pool, confirm unlock and restore changed session settings. If connection health or cleanup is uncertain, destroy that client instead of returning it for reuse. Preserve the original migration error and report cleanup failures through redacted logs; a cleanup failure must not turn a failed run into a successful startup.

**R-27.** A migration failure must leave the container unhealthy, so the previous version keeps serving. The migrator must be idempotent, so re-running it after a fix applies only what is missing (`DEC-9`, `../adr/0007-one-deployment-per-customer.md`, Consequences).

**R-28.** The Testcontainers preset must apply the same set of histories that the image applies, in the same order (`../core/roadmap.md`, Section 0 item 4b).

### Generators (item 4a)

**R-29.** An Nx local plugin under `tools/generators` must provide `@genie/module:new <capability>` and `@genie/tenant:new <slug>` (`DEC-22`).

**R-30.** `module:new` must scaffold a module package wired to every contract point, with the folder layout of R-10, a `README.md` per folder, the `module` tag, passing stage-appropriate unit/integration/E2E tests plus documented component stories/tests for generated UI (R-41d), its own migrations folder and migrations table, and every procedure and job signature already carrying `ctx.tenant` (`DEC-34`, enforcement item 4). In Section 0, generated-module unit tests prove declarations and registration; integration tests apply real migrations and prove schema behavior and router denial for the module's own permission key; browser tests prove denied access without exposing protected data at both viewports. Schema tests may use the supplied tenant context directly, but must not turn that into an authorization bypass in a procedure or page. Generated modules must not reuse `placeholder:read`, broaden the stub, add a test principal, mock an authorization grant, or skip a layer to pass. Only the original placeholder proves an authorized router and browser main path under the Section 0 stub. Section 2 item 6 updates the generator and existing generated fixtures with authorized success tests using real role assignments and the real evaluator, retaining denial tests (`../architecture/module-contract.md`, Tests row).

**R-31.** `tenant:new` must scaffold `customers/<slug>/deploy/` with all seven files of `../architecture/repository-layout.md`: `tenant.yaml`, `modules.txt`, `realm.overrides.json`, `branding.seed.json`, `compose.yaml`, `.env.example`, and `values.yaml` (`../specs/README.md`, Cross-section calls, Tenant generator files). It must validate `tenant.yaml` and `branding.seed.json` against the strict zod schemas in `packages/core/src/lib/tenant-config/`, which reject an unknown key so that a value in the wrong file fails the generator (`DEC-35`). The generator must write no secret and no hosting mode (`DEC-35`).

### Image and build script (item 5)

**R-32.** One Dockerfile in `deploy/` must build every image. `MODULE_INCLUDE` must be the only build argument, because a build argument stays readable in the image history and an image is passed to customers (`DEC-33`, `../architecture/environment-contract.md`, Rules).

**R-33.** The image must hold no credential and no secret. Every secret must enter at run time from the environment, and a secret must never be logged, echoed in an error, or returned by the health endpoint (`../architecture/environment-contract.md`, Rules).

**R-34.** `scripts/build-customer-image.sh <slug> <version>` must read that customer's `modules.txt`, build the image with that include list, and push it. A developer, Coolify, or a continuous integration job must be able to run the same script (`DEC-33`).

**R-35.** The one image must run the application, the job worker, and `genie-ops` through entrypoint flags (`../core/roadmap.md`, Section 0 item 5). Section 0 must ship the flag dispatch and the application path. The worker and the command line arrive in Section 1.

**R-36.** The application must read its public address from `PUBLIC_URL` and must never inspect the request hostname (`DEC-19`).

**R-36a.** The application must serve an unauthenticated health endpoint at `GET /api/health` whose body is `ok` and nothing else. It must answer only after startup completed, so that a migration failure leaves the container unhealthy and the previous version keeps serving. The endpoint must never return error text, a secret, or a version string. Section 1 items 2 and 4 add `degraded` on the same path (`DEC-9`, `../specs/README.md`, Cross-section calls, Health endpoint).

### Test infrastructure (item 6)

**R-37.** Vitest must run unit tests in every package from one shared preset in `packages/config`.

**R-38.** Integration tests must use Testcontainers with a disposable Postgres per test file and the real migration histories applied. No test may mock the database (`../core/roadmap.md`, Section 0 item 6).

**R-39.** `packages/core/testing` must hold only core-table factories and generic database, migration, and tenant-context helpers; none may import a module. A core table gets its factory in the section that creates it. Each module owns its table factories and router/schema integration tests: Section 0's `placeholder_record` factory lives in `packages/modules/placeholder/testing/factories.ts`. The module generator must put each generated module's factories under its own `testing/` directory. The app harness in `apps/genie/testing` owns the composed two-context isolation test of R-20 and, from Section 1, the deployment-wide Playwright seed, importing core helpers and included modules' factories rather than placing module-aware composition in core (`../architecture/repository-layout.md`, Layout; `../core/roadmap.md`, Section 0 item 6).

**R-40.** Playwright must run end-to-end tests against a compose file that starts one deployment with the core history and the placeholder module applied. Every end-to-end test must run at a phone viewport and at a desktop viewport, as two projects in one configuration (`DEC-25`).

**R-41.** Continuous integration must fail a module package that ships no tests (`../core/roadmap.md`, Section 0 item 6).

**R-41a.** Implement `../architecture/ui-development.md` as the fourth, browser-component test layer. Add `apps/storybook` to R-1's workspace and classify it `app` under R-4: development-only composition, never generator tooling or a production entrypoint. Use Next.js/Vite, the Vitest addon, Docs/Autodocs, accessibility checks, and built-in inspection controls. One Storybook discovers colocated UI, core-feature, and selected module stories without per-module host or CI edits. Shared configuration obeys R-5/R-7a; stories obey their owner's import rules. Browser-safe fixtures/providers must not initialize server services or import database factories. Storybook and its assets/dependencies stay out of customer runtime images.

**R-41b.** Apply R-3a's selection and cache guarantees to Storybook discovery, build, and component tests. Prove all-available, two different explicit selections, and explicitly empty selection. No excluded story, module code, docs, asset, fixture, or source map may leak into a scoped static build. Record story-owner dependencies in Nx so source, token, provider, fixture, configuration, and story changes affect the host. Fail on unknown module ids. Customer application stories require explicit selection, never a blanket glob.

**R-41e.** Install and configure `@storybook/addon-mcp` as development-only Storybook tooling, using the requested `npx storybook add @storybook/addon-mcp` setup command after checking current official instructions and pinned-version compatibility. Follow the local connection, confidentiality and runtime-exclusion rules in `../architecture/ui-development.md`. Extend AC-27 with a documented successful local agent connection and addon smoke check; extend AC-28 to prove the addon does not expose excluded module content or enter customer runtime images. This requirement records future work, not completed installation.

**R-41c.** Expose Nx `storybook`, `build-storybook`, and `test-storybook` targets with deterministic CI execution, separate Vitest projects/reports, and no duplicate legacy story runner. Extend R-51's pull-request gates with affected static Storybook builds and browser component tests, including failing accessibility checks; verify nonempty collection and failure propagation. The Playwright provider runs isolated components, not deployment E2E. Existing unit, real-database integration, and phone/desktop E2E gates remain mandatory.

**R-41d.** Apply the shared story-first TDD workflow to all new/changed UI and link it from AGENTS.md and CLAUDE.md. Extend R-30's UI-generating path with a documented story, behavior assertion, and browser-safe fixtures automatically discovered/tested by the host; headless modules need no dummy stories. Foundation proof uses representative UI and placeholder stories, with core business screens added only in their owning later sections. Presentation fixtures cannot bypass or broaden R-13's runtime stub. Pin a compatible toolchain and prove it with real commands; documentation support alone does not satisfy acceptance.

### Developer tooling (item 7)

**R-42.** TanStack Devtools must be mounted once in `apps/genie`, in one file imported through `next/dynamic` behind a `process.env.NODE_ENV === "development"` check, with the packages as development dependencies. The panels must be Query, Form, Pacer, and a Genie Ops Center panel that shows the current tenant, user, groups, and effective permissions (`../core/roadmap.md`, Section 0 item 7, `../core/tech-stack.md`, Developer tools). In Section 0 the panel shows the tenant values and the one key the stub grants, because no user exists yet.

### Internationalization (item 9)

**R-43.** `next-intl` must be installed with one English message catalog. Every user-facing string, starting with the placeholder module's pages, must go through it. No translation work is done (`DEC-13`).

### Logging and error responses (item 10)

**R-44.** pino must emit JSON lines carrying a request id, a tenant id, and a user id on every line, at the level named by `LOG_LEVEL`, default `info` (`DEC-31`, `../architecture/environment-contract.md`, Optional).

**R-45.** The logger must be built with a redaction list so that no secret, session token, password, authorization header, or emailed link containing a token can reach a log line. Redaction must be a property of the logger, not a rule applied at each call site (`DEC-31`).

**R-46.** An API or route error must return a stable application code and a safe message. Upstream text and database text must stay in redacted server logs and must never reach the client (`DEC-31`). One core catalogue defines application codes and their fixed safe English messages; later sections extend it and module codes use `<id>:<code>`. The request id matches the server log for the failing request. Two transport adapters use that shared definition (`../specs/README.md`, "Cross-section calls made in the drafting round", Error response body):

- Ordinary HTTP route handlers return `{ code, message, requestId }` through one route-handler helper, where `code` is the catalogue's application code.
- tRPC procedures preserve the standard tRPC error envelope and protocol fields. The one `errorFormatter` adds `appCode` and `requestId` under the error's `data`, and places the catalogue's safe message in the standard error `message` field. `appCode` is the same application code used by the ordinary route helper; it never replaces tRPC's numeric error code or its `data.code`. The standard tRPC client must decode the result without a custom transport.

Neither adapter may expose raw causes, database or upstream messages, or stack traces in the response. Unknown errors map to a generic catalogue entry rather than using their exception message.

### Security headers (item 11)

**R-47.** The application must set these headers once for every response (`../core/roadmap.md`, Section 0 item 11, `DEC-31`):

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'`; only iframe-viewer documents replace `frame-src` with validated owning-module origins under R-49 |
| `Strict-Transport-Security` | with `preload` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | minimal |

**R-48.** Core owns one shared CSP definition and serialization; the app emits exactly one final enforced CSP header per response through the framework's header mechanisms. On viewer documents replace only `frame-src`, rather than appending a second policy that still denies frames. Modules contribute origins only, never directives. The baseline has no `default-src`, `script-src`, or `style-src`, no nonce generation or propagation, and no script/style nonce requirement. Strict script/style CSP and report-only evaluation are deferred, not Section 0 deliverables.

**R-48a.** CSP imposes no blanket dynamic-rendering requirement or prohibition on static optimization/partial prerendering. Rendering and caching still follow tenant, authorization, branding and runtime-bootstrap isolation requirements; removing nonces does not authorize caching tenant-specific markup across tenants. Viewer policies remain request-bound under R-49. This baseline hardens framing, objects and base URLs; it does not provide script-injection protection or restrict scripts, styles, images, fonts or connections.

**R-49.** Dynamic `frame-src` computation is limited to iframe-viewer document requests identified by the app's server-owned route mapping. Await only the owning included module's optional `contentSecurityPolicy.frameOrigins({ tenant })` before emitting the viewer's headers. Core validates, deduplicates, and serializes origins under the canonical provider rules; no module can inject arbitrary directives. The placeholder page is the Section 0 viewer fixture and receives its fixed origin. Omitted, empty, or failed contributions leave frames denied, never a broad `https:` or wildcard fallback. Ordinary pages, API/tRPC calls, chat streams, health checks, static assets, and background prefetch/RSC requests must not invoke these providers or query frame-origin records. Entering a viewer, including from the client-side shell, requires a full document navigation to install the policy before rendering an iframe. Broader dynamic policy scope waits for a customer requirement (`../architecture/module-contract.md`, Content security policy provider).

**R-49a.** Retain ordinary security-header coverage outside the viewer using the framework's existing header mechanisms and a shared policy definition; no custom server is introduced solely for header coverage. No response requires a render nonce. Verification must count provider calls: zero on ordinary pages, API/tRPC responses, health, assets, and background navigation requests; only the owning provider on a viewer document. A browser test enters the viewer from an ordinary page and proves a new document receives the origin policy and loads the permitted iframe.

**R-50.** Verify R-47 against the built application's responses: the placeholder viewer document, an ordinary non-viewer document, an ordinary API response, a tRPC error, health, a redirect before it is followed, a 404, and representative static assets (JavaScript, CSS, and a public asset). All receive the standard headers and exactly one enforced CSP policy with the exact baseline directives; only the iframe-viewer document replaces `frame-src` with provider-derived origins. Assert absence of `default-src`, `script-src`, `style-src` and nonce sources in that policy, and verify ordinary document hydration and styling still work without nonce wiring. Count provider invocations to prove zero origin lookups on the other paths and background prefetch/RSC requests. Tests must not mistake a redirect's final destination for coverage of the redirect response itself. Section 2 adds sign-in and Section 3 adds the workspace shell; Section 4 adds the real embedded viewer and proves chat viewer/stream requests perform no frame-origin lookup (`../specs/README.md`, Section boundaries).

Use a locally controlled iframe fixture to prove actual frame content loads after full-document viewer navigation, rather than treating the iframe's load event alone as proof. With a throwing provider or invalid contribution, prove the response retains a restrictive policy and the fixture is not displayed. Header presence and provider-call checks exercise real response paths, not only the shared policy helper. Static assets use the static policy without per-request nonces or database calls.

Browser fixtures must also prove that an ordinary page cannot load a controlled iframe, a viewer cannot load an unlisted origin, another page cannot frame Genie, object content is blocked, and a cross-origin base element cannot change URL resolution. Keep positive hydration/style checks alongside these denial cases so a broken page cannot masquerade as successful enforcement. Assert that the viewer retains `base-uri 'self'`, `object-src 'none'` and `frame-ancestors 'none'` when its frame origins change. No nonce uniqueness or nonce/tag matching test remains; no blanket dynamic-rendering test is inferred from CSP. These are acceptance requirements, not a claim of runtime proof before implementation.

### Continuous integration (item 8)

**R-51.** Gates must run by trigger (`../core/roadmap.md`, Section 0 item 8):

| Trigger | Gates |
| --- | --- |
| Every change, on the pull request | `nx affected -t lint typecheck test build-storybook test-storybook` and the integration layer, plus the `README.md` check of R-9, the clean-checkout registry-generation check of R-21, and the module-has-tests check of R-41 |
| Every merge to `develop` | the above, plus the full Playwright suite at both viewports |
| Every release tag | one image per customer folder, built with that customer's include list and pushed, each of which must pass typecheck and the smoke test |

**R-52.** A per-customer build must typecheck with the registry generated from that customer's include list, so that core never depends on a module being present (`../core/roadmap.md`, Section 0 item 8).

**R-53.** The Section 0 smoke test has two cases, each booting the built image against a fresh disposable Postgres database (`../specs/README.md`, Cross-section calls, Section 0 smoke test):

- Development/CI image containing the placeholder: assert successful startup, application of core and included module histories, `GET /api/health` returning `ok`, and the placeholder page rendering with the headers of R-47.
- Customer image: assert successful startup, application of core and only the included module histories, and `GET /api/health` returning `ok` with the headers of R-47. Assert that excluded modules have no routes or tables in this fresh deployment and no migration files in the image. The placeholder is excluded under R-15 and its page must not render. This case must also pass for an explicit empty module list; it requires no business-module page.

These checks prove image composition and startup, not complete UI behavior; module and application end-to-end tests own that proof. Section 1 item 6 runs the applicable case through the generated compose file and adds its setup-state checks.

**R-54.** The release-tag job must build one image per customer folder with that customer's include list, pass the customer-image smoke case of R-53, and push it to GitHub Container Registry by calling the script of R-34. Section 5 owns the per-customer read token, the package access, the release file for a site without internet, and the runbooks (`../core/roadmap.md`, Section 0 item 8, `DEC-33`, `../specs/README.md`, Cross-section calls, Image push on release tag).

**R-55.** Until the first customer folder exists, the release-tag matrix must be empty and the job must build, pass the development/CI smoke case of R-53, and push the default all-modules image instead, so that the build path is proven before Section 1 writes a customer folder. This image contains the placeholder and is not a customer deliverable (`../specs/README.md`, Cross-section calls, Release-tag matrix before any customer exists).

**R-56.** Include Category assignment in R-11's typed module points and R-30's generator contract coverage. Preserve the single Categories UI for whole modules and records while providers own their reads/writes. Include Settings discovery metadata and the baseline-plus-additional permission declaration in configuration types. These declarations must match `../architecture/module-contract.md`; neither runtime category dispatch nor Settings UI is pulled into Section 0. The placeholder and generator exercise declarations without granting any new permission through R-13's stub.

## Acceptance criteria

| Id | Criterion | Proves |
| --- | --- | --- |
| AC-1 | `nx affected -t build test lint typecheck` on a change inside one package runs that package and its dependents and no other, cache hits are reported on a second run, and every project has exactly one of the six architectural classifications of R-4. Config and generators have their own classifications; generated modules and custom apps retain their product-layer tags. Changes to shared presets or exposed generator schemas invalidate their dependent tasks | R-1, R-2, R-3, R-4, R-7a |
| AC-2 | A file in `packages/ui` that imports `@genie/core`, a file in a module that imports another module, and a file outside `packages/core` that imports `pg` each fail `nx run config:lint` with `no-restricted-imports`. oxfmt and oxlint run on a staged file through lefthook | R-5, R-6, R-7, R-8, R-10 |
| AC-2a | Allowed fixtures prove package configuration can consume shared presets and generators can import exposed core tenant schemas without runtime environment or services. Rejected fixtures cover config importing UI/core/tooling, product runtime importing config/tooling, and generators importing core runtime, app/module implementations, or database drivers, including subpath and relative-import spellings. Generated output passes its destination's ordinary boundary checks and R-30/AC-7 tests | R-4, R-5, R-7a, R-19a, R-30, R-31 |
| AC-3 | The placeholder module declares every point of R-12 and mounts through the registry with no core change. Its read procedure refuses when `can()` is asked for any key other than `placeholder:read`, and returns rows when asked for that key. The contract test fails a module that ships an admin page without `<id>:admin` or a workspace entry without `<id>:use` | R-11, R-12, R-13, R-15, R-15a, R-16 |
| AC-4 | `createTenantContext()` is the only exported builder, no `db` singleton is exported, and the app-owned two-context isolation test passes with each context reading only its own database using module-owned factories. Import-boundary checks include testing code and reject a core test/helper importing a module. A run that skips the isolation test fails the pipeline | R-17, R-18, R-19, R-20, R-39 |
| AC-5 | A build with `MODULE_INCLUDE=placeholder` produces a bundle in which no other module appears, no other module's route answers, and no other module's table exists in the migrated database. A synthetic two-module fixture in which both carry the landing-route flag fails the registry check. The placeholder carries no flag and the Section 0 default build succeeds with zero landing entries, without a solutions dependency | R-15, R-21, R-22, R-23, R-23a |
| AC-6 | A fresh database receives the core history and then each included module's history, each recorded in its own migrations table, and a second start applies nothing and starts clean | R-24, R-25, R-28 |
| AC-7 | `nx g @genie/module:new demo` produces a package that passes lint, typecheck, and stage-appropriate unit/integration/E2E tests plus generated UI stories/component tests (AC-27) with no hand edit: declaration/registration tests, real schema/migration and router-denial tests, and browser denial tests at both viewports. Its own permission is refused by the unchanged stub, protected data is not returned, and no test layer is skipped. It carries a `README.md` in every folder it created and has `ctx.tenant` in every procedure signature. `nx g @genie/tenant:new demo-co` produces the seven deployment files, `values.yaml` included, and a branding key placed in `tenant.yaml` fails the generator | R-29, R-30, R-31 |
| AC-8 | `scripts/build-customer-image.sh <slug> <version>` builds and pushes an image from that customer's `modules.txt`. `docker history` on the image shows `MODULE_INCLUDE` and no other build argument, and the image filesystem holds no secret. `GET /api/health` on the running image returns `ok` and nothing else | R-32, R-33, R-34, R-35, R-36, R-36a |
| AC-9 | Two independent migrator processes target one disposable database. While the first holds the lock, the second enters no migration history; it proceeds only after release, or fails at `LOCK_TIMEOUT_MS` with a stable error code if the lock remains held. A subsequent run succeeds after release. Test instrumentation confirms the lock and every history use the same backend session within each run. An injected migration failure releases or destroys the owning connection, permits a later run to acquire the lock, and never starts serving. Connection loss aborts rather than continuing unlocked; no locked or uncertain client returns to the pool | R-25a, R-26, R-26a, R-27 |
| AC-10 | Unit tests run from the shared preset in every package, an integration test file gets its own Postgres container with the real histories, and a module package with no test file fails the pipeline | R-37, R-38, R-39, R-41 |
| AC-11 | The Playwright configuration declares two projects, one phone viewport and one desktop viewport, and the placeholder main-path test passes in both | R-40 |
| AC-12 | A development build renders the devtools panel with the Query, Form, Pacer, and Genie Ops Center tabs. A production build contains none of the devtools packages | R-42 |
| AC-13 | Every string on the placeholder pages resolves through the English catalog, and a missing key is visible as a failure rather than as an empty render | R-43 |
| AC-14 | A request produces a JSON log line carrying its request id, the tenant id, and the user id. A log line built from an object holding a session token, a password, or an authorization header shows the censor value instead | R-44, R-45 |
| AC-15 | A database failure in an ordinary HTTP route returns `{ code, message, requestId }`; the equivalent tRPC failure preserves its standard envelope and protocol codes, supplies the same catalogue code as `data.appCode`, supplies `data.requestId`, and uses the safe standard message. A standard tRPC client decodes the failure without a custom transport. Both request ids match their respective redacted server log entries. Neither response contains database/upstream exception text, raw causes, or stack traces; an unknown exception receives a generic safe catalogue entry | R-46 |
| AC-16 | The placeholder viewer response carries all five headers of R-47 and exactly one enforced CSP: the baseline with only `frame-src` replaced by its validated origin. Ordinary documents retain the exact static baseline; neither policy contains nonce sources or default/script/style directives. Hydration and styling work without nonce wiring, and permitted iframe content visibly loads | R-47, R-48, R-48a, R-49, R-50 |
| AC-17 | A pull request runs lint, typecheck, unit, and integration plus the three repository checks. A merge to `develop` also runs the full Playwright suite at both viewports. A release tag builds, typechecks, passes the customer-image smoke case, and pushes one image per customer folder; with no customer folder present it uses the default all-modules image and the development/CI smoke case. Verification exercises both smoke cases against fresh disposable databases, including a customer image with an explicit empty module list: its health response has the headers of R-47, the placeholder page does not render, and excluded modules have no routes, tables, or image migration files | R-51, R-52, R-53, R-54, R-55 |
| AC-18 | The image builds from the one Dockerfile for at least two different include lists, and both images start | Done-when clause 1, R-32, R-52 |
| AC-19 | The application boots against an empty database with only the core history applied, and serves | Done-when clause 2, R-25, R-27 |
| AC-20 | The placeholder module passes through every contract point that exists in Section 0, with the stub `can()` refusing every call except `placeholder:read` | Done-when clause 3, R-12, R-13, R-15 |
| AC-21 | All four test layers run green in one pipeline, including the two-context isolation test and Storybook browser component tests | Done-when clause 4, R-20, R-37, R-38, R-40, R-41a–R-41d |
| AC-22 | The end-to-end layer runs at a phone viewport and at a desktop viewport, and a failure at either viewport fails the pipeline | Done-when clause 5, R-40 |
| AC-23 | The CSP provider contract typechecks for placeholder and generated modules; omission, empty results, deduplication, invalid values, provider failures, and tenant-context isolation pass the verification cases below without broadening the policy | R-12, R-15b, R-49 |
| AC-24 | With caching enabled, build the same revision sequentially with two different explicit module selections, then repeat an identical selection. Selection-dependent targets do not reuse the other selection's result; an identical selection can reuse its cache. Inspect the registry, built bundle, and image migration files and boot against fresh databases to prove excluded modules have no code, routes, or tables. Repeat with a changed customer `modules.txt` and verify unset and explicitly empty selections are distinct. Exercise the local cache path and verify no remote cache is configured or required; repeat these isolation checks against a remote provider before any future activation | R-3, R-3a, R-21, R-22, R-52 |
| AC-25 | Every response class in R-50 carries the standard headers in the built application. Non-viewer, API, health, asset, and background requests invoke no frame-origin provider. Entering the placeholder viewer from an ordinary page creates a full document with the correct frame policy and visibly loads the controlled iframe fixture. A failed or invalid provider contribution keeps that fixture blocked without a permissive fallback | R-47, R-49, R-49a, R-50 |
| AC-26 | A clean uncached production build and image assembly succeed with deployment runtime variables absent and no deployment database or identity service reachable. Starting that same image with missing/malformed required runtime configuration exits nonzero before any database connection or listener. Injected migration failure prevents listening; valid startup completes migrations before health answers. Repeated and concurrent requests through the actual built page and tRPC paths reuse one application context/pool. Starting the same image against a second runtime configuration uses that configuration, not build-time values; the two-context isolation test remains mandatory | R-17, R-19, R-19a, R-19b, R-25, R-33 |
| AC-27 | Storybook dev/build and browser component tests work on the pinned toolchain without deployment services; documented representative stories, generator discovery, meaningful interaction/a11y failure propagation, and UI controls pass the detailed verification below | R-41a, R-41c, R-41d |
| AC-28 | Scoped Storybook outputs exclude unselected code/content; local cache and dependency invalidation checks pass, and customer runtime images exclude Storybook artifacts and development dependencies | R-3a, R-41a, R-41b |

**AC-29 (R-56, R-11/R-12, R-30).** Contract/type tests cover omitted and present category providers, tenant/caller context, assign and clear inputs, safe record descriptors, omitted/present settings metadata and additional permission, stable field references, and rejection of malformed contributions or a sixth field kind. Generated declarations typecheck without per-module core edits. Tests confirm no core import of module tables, no changed stub grants, and no excluded provider/metadata in selected registry or Storybook outputs. Real authorization, provider writes and search behavior are explicitly tested in Section 3 AC-19 and Section 4 AC-13a, not claimed here.

## Verification

Storybook acceptance (AC-27, R-41a–R-41d): launch the pinned host and inspect the UI/Core/Modules hierarchy, rendered documentation, theme/viewport controls, and working in-UI test results. Generate a disposable module with UI and prove its story appears and executes without host-list or CI edits. Prove meaningful interaction and accessibility failures fail the CLI/CI target, then pass after correction. Unit and story test collection must be distinct and nonempty for the fixture. Dev launch, static build, and component tests must require no deployment runtime variables, database, or identity provider. Verify keyboard interaction, representative phone/desktop states, and story state reset. The full future primitive/feature catalogue is not required in Section 0.

Storybook selection acceptance (AC-28, R-41b): run all-available, two explicit module selections, and empty selection against the same revision with local caching; repeat one selection to prove safe reuse. Inspect static index, chunks, assets, source maps, and fixtures for excluded identifiers/content. Mutate an included story, component, shared token, and provider to prove Nx invalidation; add/remove a module to prove discovery invalidation. Confirm the built customer runtime image contains no Storybook output, stories, fixtures, or Storybook development dependencies. These checks supplement, not replace, AC-24's production module exclusion checks.

Build/startup verification uses the actual production image and entrypoint, not only imported helpers. Instrument context/pool creation to catch duplicate initialization across framework bundles. Record the chosen runtime hook and how readiness reaches the page and tRPC execution paths; a separate migration process is not proof that the application reuses one context. Section 1 extends this evidence to worker and CLI processes, pre-setup serving and resumable setup; Section 2 adds auth and realm-step credential cases. These are implementation acceptance gates, not claims that a framework integration has already been demonstrated.

CSP contract verification (AC-23): the placeholder and a generated module typecheck against the same provider interface. The placeholder contributes its fixed HTTPS origin; generated empty and omitted providers add no origins. Tests prove deduplication, rejection of non-origin values and header fragments, and no permissive fallback on rejection or provider failure. A provider fixture called with each of two tenant contexts returns only that context's configured origins. Changing its backing records changes the policy on the next full document response. AC-16 retains the browser-level header assertion.

Unit tests, Vitest. The environment validator against valid, missing, and malformed values. The stub `can()` and `scopesFor()` against the granted key and a refused key, with one test that counts a single loader read across many calls in one request (`DEC-48`, Guard). The module contract validator against a module that declares a sixth configuration field kind, which must fail (`DEC-28`). The navigation shape against an entry with a category, an entry without one, and an entry whose category no longer exists (`DEC-51`, Guard), against a `pinned` list of seven entries, which must fail, and against a two-module fixture in which both declare the landing-route flag, which must fail the registry check (`DEC-49`). The registry generator against three include lists. The error formatter against a database error, an upstream error, and a validation error.

Integration tests, Vitest with Testcontainers against a real Postgres. The migrator, run twice, on a fresh database and on a migrated one. The migrator under a held advisory lock, asserting the timeout and the error code. The placeholder router and schema. The two-context isolation test of R-20, which never gets skipped. No test mocks the database (`CLAUDE.md`, Testing).

End-to-end tests, Playwright at a phone viewport and a desktop viewport (`DEC-25`). The placeholder module's main path. The security headers of R-47 on the placeholder page. An axe check on the placeholder pages, so the Section 3 accessibility gate starts with a passing baseline (`DEC-21`).

Pipeline checks. Every folder in the repository-layout tree holds a `README.md`. A clean checkout generates the selected registry before consumers run; repeated identical inputs produce identical output, and no committed registry is expected. Every module package holds tests. The isolation test ran.

Manual checks. Read `docker history` on a built image and confirm that `MODULE_INCLUDE` is the only build argument and that no secret appears. Read the boot log of a first start and confirm the order: environment validated, connected, lock taken, core history, module histories, lock released, serving.

## Deferred

Generated-module authorized success tests and the matching generator-template update arrive in Section 2 item 6 when the real evaluator and role assignments exist. Section 0 already runs unit/integration/E2E under R-30/AC-7 and UI component tests under R-41d/AC-27, with denial as the generated module's browser path; the original placeholder retains its authorized success path.

| Deferred item | Delivered by | Trigger or note |
| --- | --- | --- |
| Events point runtime on the placeholder module | Section 1 item 9a | The bus arrives with `emit`, `on`, `provide`, and `capability` |
| Jobs point runtime on the placeholder module | Section 1 item 9 | The pg-boss worker process |
| Entitlement filter on the registry | Section 1 item 1 | `tenant_module.enabled` and its reader |
| Settings, branding, and entitlement readers on the tenant context | Section 1 item 1 | 10 second expiry, no invalidation on save (`DEC-46`) |
| File store on the tenant context | Section 1 item 7 | `FileStorage` with the `postgres` adapter (`DEC-20`) |
| Deployment tables | Section 1 item 1 | `../architecture/data-shape.md`, Deployment tables |
| `genie-ops migrate`, the pending-migration count, Squawk, and `drizzle-kit check` | Section 1 item 4 | `DEC-43` |
| `pnpm seed` and `genie-ops setup` | Section 1 item 5 | Named in Section 0 item 6 and deferred there in the same line |
| Stack template and the compose-file smoke test | Section 1 item 6 | Runs the applicable R-53 case through generated compose and adds setup-state checks |
| `GET /api/health` reporting `degraded` | Section 1 items 2 and 4 | Section 0 returns `ok` only (R-36a) |
| Real `can()` evaluator and the permission filter on navigation | Section 2 item 6 | The loader shape of R-13 and R-14 does not change (`DEC-48`) |
| Default roles seeded on entitlement | Section 2 item 6 | Section 0 declares them only |
| Security headers on the sign-in page | Section 2 | `../specs/README.md`, Section boundaries |
| `ConfigForm` rendering the five field kinds | Section 3 item 10 | Section 0 ships the contract test only (`DEC-28`) |
| Shell rendering the navigation tree, and the Modules and Categories pages | Section 3 items 4 and 11 | `DEC-50`, `DEC-51` |
| Security headers on the workspace shell | Section 3 | `../specs/README.md`, Section boundaries |
| Record-scoped `can()` and `scopesFor()` proven end to end | Section 4 item 2 | `DEC-39` |
| Streaming route pattern in core | Section 4 item 3 | First consumer is the solutions module |
| Per-customer read token, package access, the `docker save` release file, and the hosting runbooks | Section 5 | The push itself is Section 0 (R-54). Section 5 owns customer-facing delivery (`DEC-33`) |
| Streaming route pattern under `/api/m/<id>/`, authenticated by the session and `can()` | Section 4 item 3 | Distinct from the Inbound endpoints point, which serves customer systems by key |
| Remote build caching | Not scheduled | Revisit after measuring cross-machine build costs; approve provider, artifact confidentiality/access and credentials, then repeat AC-24/AC-28 against that provider before activation |
| Setup and upgrade automation, and its tool | Not scheduled | `OPEN-7`. No specification chooses the tool (`DEC-38`) |

Assumptions
- The placeholder table is named `placeholder_record` rather than an unprefixed name. Module table rule 1 allows a prefix to avoid a collision, and the placeholder's rows must be obvious in a shared test database. Consequence if wrong: a rename in one migration.
- Section 0 renders the merged navigation as a plain list on the placeholder page, because the shell arrives in Section 3 item 4 and the section-boundaries table still requires the registry to render declared navigation with no filter. Consequence if wrong: the navigation point has no runtime proof until Section 3.
- The minimal `Permissions-Policy` value is a routine call, because `DEC-31` fixes the rule and not the value. Proposed value: `camera=(), microphone=(), geolocation=(), payment=(), usb=()`. Consequence if wrong: one constant changes.
- The root `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` scripts named in the gates of `CLAUDE.md` delegate to `nx run-many` or `nx affected`, because the same file forbids running package scripts directly across the repository. Consequence if wrong: the two rules stay in conflict.
- Verified against current documentation: the oxlint `no-restricted-imports` rule with `paths` and `patterns`, and per-glob `overrides` in the oxlint configuration. pino `redact` with `paths` and `censor`. Playwright projects with a per-project viewport. Testcontainers `@testcontainers/postgresql` with `PostgreSqlContainer` and `getConnectionUri()`. drizzle-kit `migrations.table` in `defineConfig`, `migrate()` with `migrationsFolder` and `migrationsTable`, a per-folder configuration file selected by `--config`, and `drizzle-kit check`. Nx inferred tasks from plugins in `nx.json`, project tags in `package.json`, a local plugin created with `@nx/plugin`, and `nx affected` in a pipeline. The earlier Next.js nonce-policy investigation is superseded by the accepted minimal CSP in R-47–R-50; it is not an implementation requirement.
- Not verified, and taken from `../core/tech-stack.md` as stated: Node 26, TypeScript 7, pnpm 12, Vitest 5, Testcontainers 12, TanStack Table 9, oxlint 1, oxfmt 0, lefthook 2, Drizzle ORM 0.45 with drizzle-kit 0.31, and `next-intl` on Next.js 16. Consequence if a version line is wrong: a pinned version changes and the shape of the requirement does not.
- Tasks are inferred from package scripts as `../core/tech-stack.md` states. Nx infers tasks through plugins configured in `nx.json`, so the chosen plugin set must cover the scripts each package exposes. Consequence if wrong: targets are declared per package instead of inferred, at the cost of more configuration and no change to behavior.

Open questions
- No open product requirement in Spec 0. The specification and technical plan were approved for ticket breakdown on 2026-09-19; pinned compatibility and native runtime/header composition still require G1/G2 implementation proof. During the Spec 0 review, the product owner accepted R-46's two transport representations: ordinary HTTP routes return `{ code, message, requestId }`; tRPC retains its standard envelope with `data.appCode`, `data.requestId`, and the safe standard message. Both use the same core catalogue (`README.md`, "Cross-section calls made in the drafting round", Error response body).
