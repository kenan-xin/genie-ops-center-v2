# Repository Layout and Customer Variation

Status: draft for review, 2026-09-17. One monorepo owned by Genie Ops Center (`DEC-22`). Code is organized by capability. Customers appear only in configuration. Every customer runs its own deployment from its own image (ADR 0007, `DEC-33`).

## Layout

```
genie-ops-center/
  apps/
    storybook/                      Development-only app composition: UI, core-feature and selected module
                                    stories. Next.js/Vite; no runtime bootstrap or customer image output.
    genie/                          The standard Next.js application. One composition of core, ui, and modules.
      src/app/(auth)/               Sign-in, break-glass, tenant pages.
      src/app/(workspace)/          Member routes. Thin files that render module pages.
      src/app/(admin)/              Admin routes. Thin files that render core and module admin pages.
      src/app/api/                  Better Auth handler, tRPC, chat stream, health, /api/m/<module>/ endpoints.
      src/context.ts                Builds the one TenantContext at startup from the environment (DEC-34).
      src/modules.ts                Module registry. Generated at build time from MODULE_INCLUDE;
                                    imports only the included modules (DEC-33). Gitignored, never committed or
                                    hand-edited; generated before consumers run (ADR 0008).
      testing/                      App composition tests, including two-context isolation; deployment-wide
                                    Playwright seed from Section 1. Imports core helpers and module factories.
  packages/
    core/                           Tenant context, auth, authz, people, groups, roles, branding, settings,
                                    audit, notifications, files, mailer, events, jobs, integrations, shell.
                                    Exports createTenantContext() and no connection singleton (DEC-34).
      contracts/                    Capability interfaces and cross-module event schemas. Imports only
                                    zod and types, enforced by lint (DEC-42).
      src/lib/<name>/               Mini-packages with their own API.
      src/utils/                    Small stateless helpers, one file per topic, named by the topic.
      src/services/<name>/          Mailer, files, events, jobs, auth, and every other unit that does
                                    work for the application.
      migrations/                   The core drizzle-kit history.
      testing/                      Core-table factories and generic database, migration, and tenant-context
                                    helpers. No module imports; composed tests and seed belong to the app.
    ui/                             Design-system primitives and tokens.
    config/                         Tagged config: shared tsconfig, oxlint, oxfmt, Tailwind, Vitest and Storybook presets.
                                    No internal project imports; consumed by configuration files, not runtime.
    modules/
      solutions/                    Platform module, every tenant.
      agreements/                   Built for the first customer. Entitled to that tenant only, for now.
      approvals/                    Built for the first customer. Deferred on discovery.
      document-extraction/          A generic module, when the team is ready to design one.
      <capability>/
        src/index.ts                The module definition: id, schema, router, permissions, roles,
                                    record types, navigation, pages, config schema, events, jobs.
        src/schema.ts               Drizzle tables.
        migrations/                 This module's own drizzle-kit history and migrations table (DEC-33).
        src/router.ts               tRPC procedures, every one behind can().
        src/permissions.ts          Permission keys and default roles.
        src/config.ts               zod schema for per-tenant module settings.
        src/pages/                  Workspace and admin page components.
        src/components/             Module-only components.
        src/services/<name>/        The module's business logic and integrations.
        src/utils/                  The module's small stateless helpers, named by topic.
        src/lib/<name>/             Only when the module carries a mini-package.
        testing/factories.ts        Factories for this module's tables.
        e2e/                        At least one Playwright main-path test.
        README.md                   Points to docs/modules/<capability>/.
  tools/
    generators/                     Tagged tooling: Nx local plugin, module:new and tenant:new.
                                    Uses config and exposed build-safe core schemas/types only; generated
                                    modules/apps follow their destination tags and import rules.
  scripts/
    build-customer-image.sh         docker build with the customer's include list, then push (DEC-33).
    seed.ts                         Interactive local seed: slug, modules, first administrator.
  customers/
    <slug>/                         One folder per customer. Composition and configuration, never capability.
      runbook.md                    The operations record: hosting mode, host, Postgres, SMTP, Keycloak own or
                                    supplied, object storage, delivery path, image version, recovery requests.
                                    Values no code reads (DEC-35). From the template in docs/runbooks/.
      deploy/
        tenant.yaml                 Modules, onboarding mode, local_accounts, first administrators,
                                    break-glass email. Input to the generator and to genie-ops setup.
                                    Every field is read by one of them; nothing here is a note, nothing
                                    here repeats .env, and nothing here is branding (DEC-35, DEC-36).
                                    Validated by the strict schema in packages/core/src/lib/tenant-config/,
                                    with a yaml-language-server comment pointing at deploy/schemas/.
        modules.txt                 The module include list for this customer's image, one id per line,
                                    written by the generator from tenant.yaml (DEC-33).
        realm.overrides.json        Deltas on the realm template for this customer.
        branding.seed.json          Initial authored branding; required values and omission rules follow
                                    architecture/branding-seed.md (DEC-35). Replaced by the admin
                                    portal after go-live. Validated by the strict schema in
                                    packages/core/src/lib/tenant-config/; carries a $schema key (DEC-35).
        compose.yaml                Generated from deploy/stack/. Committed; holds no secret.
        .env.example                Generated from the environment contract. The real .env is never committed.
        values.yaml                 Helm values, written by the generator and used only when the customer runs Kubernetes.
      app/                          Only when this customer needs an entirely different experience
                                    (level 8): an Nx app composing core, ui, and modules.
  deploy/
    Dockerfile                      The one image build. MODULE_INCLUDE is a build argument (DEC-33).
    stack/                          The stack template: compose file with the app, the worker, and
                                    Keycloak; Helm values; .env.example. Copied into customers/<slug>/.
    keycloak/
      realm-template.json           Brokered variant.
      realm-template.local.json     Local-accounts variant, with SMTP settings. No email theme (DEC-40).
    schemas/                        JSON Schema for tenant.yaml and branding.seed.json, written by
                                    nx run core:schemas from the zod schemas; CI fails when stale (DEC-35).
  docs/
```

Where a piece of code goes is decided by three questions, inside `packages/core/src/` and inside every module's `src/`. Is it a mini-package with its own API that could stand alone? Then it is `lib/<name>/`. Is it a small generic stateless helper? Then it is a file in `utils/`, one file per topic, added only after the standard library and es-toolkit were checked, and never a wrapper around a library function. Does it do work for the application, business logic or an integration such as the mailer, the file store, the event bus, or a connector? Then it is `services/<name>/`. The three folders exist so that a reader, human or agent, searches one known place before writing a duplicate. A file or folder name says what it does, so the folder's `README.md` says only what belongs there and never lists files. Feature code that is none of the three, such as a router, a page, or a schema, stays in its feature folder.

Every folder that the tree above names holds a `README.md` that says in a few lines what the folder is for, what belongs in it, and what must not go in it. A package folder's `README.md` also names what it imports. The module generator and the tenant generator write that file for the folders they create, and CI fails a package folder without one.

A customer folder holds two kinds of thing and no third: the customer's deployment configuration, and, when they need one, the custom application that composes core and modules for them. It never holds a module. A module is a capability, lives under `packages/modules/<capability>`, and is given to a customer by adding it to their include list, so it can be given to a second customer without moving. The slug in `customers/<slug>` names the image and the stack and will usually be recognizably the customer's; that is acceptable in this folder and in deployment configuration, and not acceptable in `packages/`, `apps/genie`, or `docs/`.

## Module package naming

Owner decision, 2026-09-20: each module is an independent package named `@genie/module-<capability>` in `packages/modules/<capability>/`. The folder basename matches the unprefixed module ID; the package name adds `@genie/module-`. The prefix groups module imports for IDE discoverability, although actual suggestions depend on IDE indexing and available dependencies. No folder rename is required. This supersedes the earlier same-day proposal to repeat `module-` in folder names. For example, `packages/modules/contract-data/` declares `@genie/module-contract-data`; its module ID remains `contract-data`. The `module-` prefix is not part of IDs, permission namespaces or customer include-list entries. Documentation remains under `docs/modules/<capability>/`.

`@genie/modules/<capability>` is a legal import specifier for a subpath of an umbrella package named `@genie/modules`; this architecture does not define that package. No umbrella or alias mapping is required by the chosen convention. This singular `module-` decision supersedes the earlier plural `modules-` proposal.

Implementation reconciliation is tracked by `genie-ops-center-v2-ygn`, including the naming-enforcement gap `genie-ops-center-v2-1rd.1.4`. Discovery, generators, fixture manifests, active path references and import-boundary tests must agree with this contract. This documentation update does not claim that those code changes or validation have occurred. Existing defensive plural/slash restrictions and historical evidence remain intact; singular package roots and public subpaths require equivalent enforcement.

## How a customer's requirement is met

UI stories are colocated with their owning component, not moved into the composition host. The development-only Storybook app aggregates browser-safe stories without relaxing package import rules. Discovery, module selection, Nx dependencies, and customer-artifact confidentiality follow [Storybook and UI development](ui-development.md). Capability modules created for a tenant use the same story convention as every other module.

Work down this list and stop at the first level that satisfies the requirement. Each level is cheaper and safer than the next.

1. Branding and tenant settings. Look, sign-in page, email, locale, onboarding mode, idle timeout, local accounts. The tenant administrator does it in the admin portal. No code, no operator.
2. Roles and groups. Who may do what. The tenant administrator does it in the admin portal. No code.
3. Entitlements. Which modules the customer has: the include list decides what is compiled into their image, and `tenant_module.enabled` switches a compiled module off without a rebuild. No code.
4. Module configuration. A module declares a zod schema for its per-tenant settings, stored in `tenant_module.config` and edited on the Tenant Settings page. A module that two customers use with different rules exposes those rules here: thresholds, default values, which optional fields show, which steps an approval chain has. No code for the second customer.
5. Integrations. A module that connects to a customer system reads a `tenant_integration` record: the customer's file share, document system, or bucket. Configuration and a secret reference, no code.
6. A new module. When the requirement is a capability that does not exist, `nx g @genie/module:new <capability>` scaffolds it under `packages/modules/`, named by what it does. It is entitled to the customer who asked. It becomes generic by entitlement, not by moving.
7. Hosting. Every customer has its own deployment from its own image (ADR 0007). The choice here is where it runs and who operates it: on Genie's servers, in the customer's infrastructure with Genie operating it, or in the customer's infrastructure with the customer operating it (`DEC-33`). Other customers' modules are absent from the image, code and schema alike, and the customer never receives source.
8. A custom application. When the customer needs an experience the standard shell cannot express: a different navigation model, a purpose-built landing experience, a kiosk or embedded surface, or a portal that combines modules in its own way. An app is created under `customers/<slug>/app/` in the same monorepo. It composes `packages/core` (tenant routing, auth, authz, services, routers) and `packages/ui` (primitives and shell parts) with the modules it wants, and ships as that customer's image. It is still owned by Genie Ops Center, still tested in the same CI against the same core, and still forbidden from containing business logic: what it owns is composition, layout, and screens. The cost is maintaining that app's screens as core evolves, and only that customer pays it.

This level is what keeps core honest as a library. `apps/genie` is one composition, not the product; core exposes its capabilities as services, routers, and shell parts that any app in `apps/` can assemble, and a module's pages and navigation are components that render inside whatever shell the app provides. A capability that only works inside `apps/genie` is a defect in core.

Forbidden at every level: a branch on the tenant in code (`if (tenant.slug === ...)`), a copy of a module for a second customer, a module inside a customer folder, or a column added to a core table for one customer's data. If a requirement cannot be met by levels 1 to 7, the module contract or the core is extended once, for everyone.

## Two customers, one module, different rules

The first customer registers agreements by office and needs a 90-day reminder. A second customer registers them by legal entity and needs 30 and 7 days. The module's configuration schema carries `scopeDimension` (office or entity) and `reminderDays` (a list). Both tenants run the same module code; their `tenant_module.config` rows differ. If the second customer's rules diverge in structure rather than in values, for example a two-stage legal review that the first customer does not have, the module gains a configurable stage list rather than a second module, unless the two workflows share no screens, in which case they are two modules.
