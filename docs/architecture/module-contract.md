# Module Contract

Status: draft for review, 2026-09-16. This is the single list of what a module may declare and what core provides. Customer modules are unknown in advance, so the rule is: a module uses these points and nothing else, and when a module needs something not on this list, the list is extended in core once, in the same change, so every later module gets it. A module never reaches around the contract.

## What a module declares

| Point | Shape | Core uses it for |
| --- | --- | --- |
| Identity | `id` (kebab-case), display name, version | Entitlements, navigation groups, permission key prefix |
| Schema | One Drizzle schema file and its own migration history | Applied after the core history, only in images that include the module (`DEC-33`) |
| Router | One tRPC router | Mounted under the module id when the module is enabled, every procedure behind `can()` and reading only through `ctx.tenant` (`DEC-34`) |
| Permission keys | `<id>:<action>` with labels. A module with a workspace entry declares `<id>:use` and requires it on every workspace entry (`DEC-50`) | Role editor, `can()`, the access column of the Modules page |
| Record types | Types a scope can point at, each with an optional list of parent types and a resolver from id to `{ label, path?, parents? }`, where `parents` lists the record's parent scopes as type and id pairs, one per declared parent type. Core renders a link only when `path` is present, and `path` must be a route the caller may open under `can()`. `can()` matches a resource against its own scope and the parents the resolver returns; `scopesFor()` returns parent scopes unchanged and the module filters on its parent columns (`DEC-39`) | The scope picker in role assignment, the Access overview, the audit reader's link to a target that still exists |
| Default roles | Named permission sets, including `<Display name> user` carrying `<id>:use` for a module with a workspace entry (`DEC-50`) | Seeded when the entitlement is enabled, marked system |
| Navigation | Workspace entries and admin entries with required permission, and a navigation tree: `{ pinned: Entry[] (at most six, ordered), entries: Entry[] }`, built from the records the person may reach and resolved per request after `can()`, where an entry can carry `categoryId`, the id of a core `category` row. Core groups the entries by its own `category` table, places the module's static workspace entries under `tenant_module.category_id`, renders one tree, and persists collapse state per device. Core never reads a module table to build it, and a module treats a category id that no longer exists as no category (`DEC-51`). One workspace entry can be marked the landing route, and core sends a person there after sign-in (`DEC-49`) | The shell renders only what the person may reach, including the pinned rail and the category tree, and opens the landing route after sign-in |
| Pages | Page components for workspace and admin, designed mobile first | Thin route files in the app |
| Configuration schema | `configSchema`, a zod object for per-tenant module settings, limited to five field kinds: string, number, boolean, enum, string list (DEC-28) | The Tenant Settings page renders one card per module with `ConfigForm`; the save procedure validates with the same schema; values stored in `tenant_module.config`. A module that needs more ships its own settings page. |
| Events | Named event types the module emits, with versioned payload schemas | Notifications, email, audit, and other modules subscribe. The bus arrives in Section 1 item 9a, and the placeholder module gains this point then (`core/roadmap.md`, Section 0, item 3) |
| Capabilities | Interfaces from `packages/core/contracts` the module provides | Another module asks core for a provider at runtime, optional |
| Jobs | Named job handlers and optional schedules | Run by the core worker on pg-boss, each handler given the tenant context. The worker arrives in Section 1 item 9, and the placeholder module gains this point then |
| Inbound endpoints | Route handlers under `/api/m/<id>/...` | Authenticated by a tenant API key or a signed webhook secret held as a `tenant_integration`; never by a user session |
| Integrations | Kinds of external system the module can connect to | `tenant_integration` records and secret resolution |
| Content security policy | Origins the module adds to `frame-src`, computed per request from its own records | The security headers set once in the app (`DEC-31`) |
| Tests | Unit, integration, factories, one end-to-end main path | CI gate |

## What core provides to a module

- Tenant context: one object with the database connection, settings, branding, entitlements, and file store, passed into every procedure, job, and page. It is the only way to reach any of them (`DEC-34`).
- Identity and access: the current user, groups, `can(user, permission, resource?)` for one resource, `scopesFor(user, permission)` for a list query (`DEC-39`), and the assignment tables. Both functions read the person's assignments once per request and answer later calls from that read, so a role change applies on the next request (`DEC-48`).
- Files: `FileStorage` (store, fetch, tokenized link) with scan status.
- Email: the branded mailer with React Email templates.
- Notifications: write an in-app notification for a user.
- Audit: `audit(action, target, summary, metadata)`.
- Events: `emit(event)` and `on(event, handler, { serializeBy? })`; handlers run in process for fast reactions and through pg-boss for anything slow or retryable. Emission happens after the emitting transaction commits. Delivery is at least once and unordered unless the subscription sets `serializeBy`.
- Capabilities: `provide(name, implementation)` and `capability(name)`, with the interfaces declared in `packages/core/contracts`.
- Jobs: `enqueue(job, data, options)` and schedules.
- Streaming: the server-side proxy route pattern with a per-user send lease, for a module that relays an upstream event stream to the browser. First used by the solutions module (roadmap Section 4).
- Integrations: resolve a `tenant_integration` to configuration plus the live secret at call time.
- UI: the design-system primitives in `packages/ui`, the shell slots (page header, actions, empty state), tables, forms, and the record picker.
- Testing: the shared Vitest presets, Testcontainers Postgres, core factories, and the seeded Playwright environment.

## How modules talk to each other

Modules never import each other. Every conversation goes through core on one of four channels.

1. Events, the default. A module emits a named event with a zod-validated payload. An event only its own module handles is declared inside the module. An event that another module subscribes to is declared in `packages/core/contracts` with its name, schema, and version, and both sides import it from there (`DEC-42`). Any module subscribes through core's `on()`. Fast handlers run in process; slow or retryable ones run as pg-boss jobs. If the emitting module is disabled or not in the image, the event never fires.
2. Shared core records. A `file.id`, `user.id`, `group.id`, a notification, or an audit event handed over in an event payload. Both sides use the core service; neither reads the other's tables.
3. Capabilities, for the rare synchronous ask. Core declares a small named interface in `packages/core/contracts` (for example `DocumentSource`); a module registers as its provider; another module calls `capability('document-source')` and gets the provider or nothing. Both compile against core, never against each other, and a consumer must behave when the answer is nothing.
4. References by type and id. A record in one module remembers a record of another as a `<type>:<id>` text pair, labeled through the owning module's record-type resolver, never a foreign key.

Rules that keep the channels safe: `packages/core/contracts` imports only zod and TypeScript types, enforced by the oxlint `no-restricted-imports` rule, so a contract never pulls a module or a core service with it (`DEC-42`); event payload schemas are versioned and never change shape in place; events are emitted after the emitting transaction commits, are delivered at least once, and arrive in no guaranteed order, so every handler is idempotent and tolerates an older event after a newer one; a handler that cannot tolerate that subscribes with `serializeBy`, a function from the payload to a key such as the record id, and core then runs the jobs for one key one at a time in emission order (a pg-boss queue with the `key_strict_fifo` policy and the key as `singletonKey`), while jobs for different keys still run in parallel, and because a job that exhausts its retries on a serialized key blocks every later job for that key, every serialized queue declares a pg-boss dead-letter queue, the worker logs the move at error level, and the operator runbook names the recovery (retry or delete that job); a subscriber or capability consumer works when the other module is disabled or absent; every event carries a correlation id for tracing. Two modules that need each other's data synchronously and often are one module; merge them rather than widen a channel.

## What a module must not do

- Import another module. Cross-module needs go through core events or core records.
- Read or write another module's tables, or core tables other than `audit_event`, `notification`, and `file` through the services above.
- Check permissions anywhere except `can()`, or list records with record-scoped access without filtering on `scopesFor()` (`DEC-39`).
- Store a credential. Only a `tenant_integration.secret_ref`.
- Know who hosts the deployment, or which adapter stores files.
- Import a database driver or open a connection. The only database is `ctx.tenant.db` (`DEC-34`).
- Import from any `apps/*` package or assume the standard shell. Pages and navigation are components rendered by whichever app composes the module.
- Add a column to a core table. If a module needs data about a user or group, it keeps its own table keyed by `user.id` or `group.id`.

## How the contract grows

When a module needs a capability that is not in the first table, the change is made in core, documented here in the same pull request, and covered by a test in the placeholder module. Examples that are foreseeable and deliberately not built yet: full-text search across module records, a dashboard widget slot on a core Dashboard page (deferred by `DEC-49` until a second widget has requirements), per-user module preferences, and an outbound webhook subscription for customer systems. Each is a small addition to this list when a real module needs it. The navigation tree in the Navigation row was such an addition, made when the shell design needed a pinned rail and a category tree.
