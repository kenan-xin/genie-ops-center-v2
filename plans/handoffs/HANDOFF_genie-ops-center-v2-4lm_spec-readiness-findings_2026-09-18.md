# Planning docs reconciled through DEC-51; next session writes the Section 0 specification

**Date:** 2026-09-18
**Status:** COMPLETED (planning round) / IN PROGRESS (bead `-4lm`, specification not started)
**Bead(s):** genie-ops-center-v2-4lm (primary), genie-ops-center-v2-0gr, genie-ops-center-v2-bqi
**Epic:** Genie Ops Center v2 planning, before any application code
**Chain:** `genie-ops-center-v2-4lm` seq `1`
**Parent:** `none — first in chain`
**Prior chain:** none — first in chain

---

## Reference Documents

Read in this order. Every path is relative to `/home/kenan/work/genie-ops-center-v2`.

- `CLAUDE.md` — project rules: read-first list, writing rules, architecture invariants, monorepo layout, testing layers, conventions, Beads.
- `docs/README.md` — folder map and the five rules for every document.
- `docs/core/vision.md` — product, Decided table (`DEC-1` to `DEC-51`), Open decisions (`OPEN-7` is the only open platform row).
- `docs/core/roadmap.md` — Sections 0 to 5 in dependency order, each with work items and a definition of done. Section 0 is lines 6 to 43.
- `docs/core/decision-log.md` — every `DEC-n` with Question, Decision, Why not, Trade-off, Guard, Designed in, Implemented, Design files affected, Revisit.
- `docs/core/tech-stack.md` — every dependency and why.
- `docs/architecture/module-contract.md` — the extension points a module may use (table with rows Identity, Schema, Router, Permission keys, Record types, Default roles, Navigation, Pages, Configuration schema, Events, Jobs, Inbound endpoints, Integration kinds, Tests) and the not-built list.
- `docs/architecture/data-shape.md` — deployment tables, core tables (now with a `### Navigation` subsection holding `category`), module table rules.
- `docs/architecture/access-model.md` — sign-in, `groups` claim, group-to-role mapping, local groups.
- `docs/architecture/repository-layout.md` — full tree and the eight levels of customer variation.
- `docs/architecture/environment-contract.md` — every variable the image reads, plus a section for values Docker Compose reads and the image never reads (`IMAGE_TAG`).
- `docs/adr/0001` to `0007` — do not change any ADR. 0007 (one deployment per customer) supersedes parts of 0001, 0003, 0005.
- `docs/modules/README.md`, `docs/modules/solutions/README.md` — the solutions module (first platform module, Section 4).
- `docs/runbooks/deployment.md` — manual deployment guide. Must not mention Coolify.
- `docs/review-2026-09-17.md` — the two review passes (sections 1 to 7); every finding is decided, fixed, deferred with a trigger, or marked not applied.
- `docs/review-2026-09-17-sources-of-truth.md` — the design-folder ownership review; Order items 1 to 4 applied 2026-09-18, item 5 waits for the design owner.
- `docs/design/README.md` — design ownership rule, naming rule, standing check, handover rule, design-round table.
- `docs/specs/README.md` — one specification per roadmap section, named `NN-<section>.md`, approved before tickets.

## The Goal

Genie Ops Center v2 is an enterprise application platform: one repository, one Dockerfile, shared core, business modules, one image per customer that carries core plus that customer's modules, one database and one Keycloak realm per deployment (ADR 0007, `DEC-33`). The repository holds planning documents only. No application code exists. The rule in `CLAUDE.md` says that no roadmap section starts without an approved specification in `docs/specs/`. This session closed the last planning gaps: two new decisions (`DEC-50`, `DEC-51`) for a forgotten requirement, two contract questions the design raised, and the cleanup of `docs/design/` so that one file owns each fact. The next session writes `docs/specs/00-monorepo-foundation.md` and then the realm runbook, both under bead `genie-ops-center-v2-4lm`.

## Where We Are

- Planning is complete through `DEC-51`. `bd list --status=open` shows three beads: `-4lm` (P2, Section 0 spec and realm runbook), `-0gr` (P4, `__Host-` cookie prefix and trusted proxy IP in Better Auth), `-bqi` (P4, module name contracts vs agreements, waits on discovery). Six beads closed. Nothing is in progress.
- `docs/specs/` holds only `README.md`. `docs/tickets/` is empty. No specification exists yet.
- The recorded trigger for the Section 0 specification was "UI and UX designs ready" (`docs/review-2026-09-17.md` section 6 item 5). All seven section designs, the shell, and the token layer are delivered as text under `docs/design/` and reconciled with every decision through `DEC-51`. The trigger is met.
- `DEC-49` (recorded earlier in this session): the landing page after sign-in is the solutions module's own hub. No core Dashboard, no landing-slot contract point. One workspace navigation entry carries a landing-route flag. Closes `OPEN-8`.
- `DEC-50` (this session): a tenant administrator switches a compiled module on or off, sees who reaches it, and places it in a category from a Modules page in the admin portal behind `core:settings:manage`. Contract: a module with a workspace entry declares `<id>:use`, requires it on every workspace entry, and seeds a `<Display name> user` role. No seventh core permission key. One core procedure writes `tenant_module.enabled`, shared by the page and `genie-ops module enable|disable`.
- `DEC-51` (this session): `category` (id, name unique, position, created_at, updated_at) is a core table with a Categories admin page behind `core:settings:manage`. The solutions module keeps `solution_category` and references the core category by id (module rule 2). Navigation tree shape is `{ pinned: Entry[] (at most six, ordered), entries: Entry[] }` with an optional `categoryId` per entry. Core groups by its own table, places a module's static workspace entries under `tenant_module.category_id`, renders one tree. A deleted category leaves members ungrouped.
- Two contract points settled 2026-09-18 without a user decision, recorded in `DEC-50` and `DEC-51`: the Categories page counts members from `tenant_module.category_id` only (no solutions count, because `solution_category` is a module table core does not read), and the category picker on the Modules page shows for any module with a static workspace entry, which includes the solutions module through its hub (`DEC-49`). A module with no static workspace entry has no picker.
- Four points stay "Left to the design" on the decision lines: CATEGORIES and OTHER headings, sort by label inside a category, muted holders with an Off pill for a switched-off module, and the switch-off confirm copy and audit wording.
- `docs/design/` was cleaned to the sources-of-truth review: five duplicate files deleted (`product-overview.md`, `product-roadmap.md`, `data-shape/data-shape.md`, `design-system/colors.json`, `design-system/typography.json`), seven working records moved to `docs/design/history/` each with a first line "Record, not current", all PNG captures removed, `design-system/tokens.md` line 3 no longer points at the deleted JSON files, and `docs/design/README.md` rewritten.
- **Reversed later on 2026-09-18.** The design repository is being deleted, so there is no design tree left to hold anything. The 277 captures are back under `docs/design/sections/` and `docs/design/shell/`, and the component source is under `docs/design/reference/`. This repository is now the only home for the design.
- `docs/design/` now contains: `README.md`, `design-system/tokens.md`, `history/` (eight records), `reference/` (181 component files with their own `README.md`), `research/theming-2026-09-17.md` (cited by `DEC-47`), `sections/<seven>/` each with `spec.md`, `types.ts`, `data.json` and its captures, and `shell/spec.md` with its captures. 491 files, 32 MB.
- `docs/README.md` design row updated 2026-09-18 from "Empty, awaiting design owner" to the delivered state.
- Roadmap Section 3 item 11 (new this session): Modules and Categories pages. Section 3 item 4 names core categories. Section 4 item 1 names navigation entries with core category ids in the one tree.
- `docs/modules/solutions/README.md`: the `category` table is gone from the module; `solution_category.category_id` is a core id; work item 4 lists Solutions, Chat themes, Access overview, and points Categories at core.
- Two edits are still owed, and they are now made here rather than asked for. Both are unstarted as of 2026-09-18. First, drop `Category.solutionCount` (`docs/design/sections/audit-and-tenant-settings/types.ts:94`) and `ungroupedSolutionCount` (`types.ts:143`, `data.json:804-829`), show one modules count pill, and reword the delete confirm. Second, trim `docs/design/sections/solutions/spec.md:44` to cite `docs/modules/solutions/README.md` for the limits instead of restating 80 and 500.
- Nothing is committed. The docs are not tracked in git in this working copy (use `mv` and `rm`, never git operations, for docs). Conservative Beads profile: no commit or push unless asked.

## What We Tried (Chronological)

1. **Prompt 2 from the design agent applied (early).** `DEC-49` recorded (landing page = solutions hub), `OPEN-8` closed, `docs/design/README.md` set to a text-only handover, `DEC-47` amended to "solid surfaces only" (brand color fills solid surfaces through `--primary` and `--primary-foreground` only; tinted surfaces stay fixed neutral gray). Result: design and docs agree on the first page after sign-in.
2. **Forgotten requirement raised by the user (mid).** "admin should be able to turn a custom module on and off like solutions in v1, and admin can control which user group can see the particular module and can move the module into a category just like solutions." First analysis: entitlement exists (`tenant_module.enabled`) but only through the CLI; visibility is a role assignment with no per-module view; categories were a solutions table. Asked one question with AskUserQuestion: where does the category live. User chose "Category moves to core". Result: `DEC-50` and `DEC-51` written with all nine fields, vision Decided rows, module contract rows, data-shape, roadmap, solutions README updated. Verified with grep that no `groups: {` tree shape, no `ungrouped` shape, and no solutions-owned `category` table remained.
3. **Prompt for the design agent (mid).** Delivered as a code block: read `DEC-49`/`50`/`51`, the Navigation, Permission keys, Default roles rows, roadmap Section 3 item 11; update shell spec, admin navigation, new Modules and Categories pages, solutions admin spec, `types.ts`, `data.json`; rules mobile first (`DEC-25`), `--primary` only (`DEC-47`), no Dashboard (`DEC-49`), no role assignment on the Modules page, say "Genie Ops Center", never name a customer; report changed files and gaps; do not commit.
4. **Design agent delivered and raised six questions (late).** Its record is `docs/design/history/update-dec-49-50-51-2026-09-17.md`. Another agent triaged: two are contract questions (solution count on `Category`, picker on the Solutions row), four are design copy. The six were first filed as "Left to the design" lines in `DEC-50` and `DEC-51`.
5. **Two contract points settled (late, 2026-09-18).** Considered a `categoryMembers` extension point in the module contract for the solutions count; rejected for now as unneeded (YAGNI) and recorded as the Revisit path. Considered counting from navigation entries; rejected because the tree is filtered per person by `can()`, so an administrator's count would be wrong. Chose: count modules only. For the picker: the claim "Solutions has no static workspace entries" was wrong, because the hub is a static workspace entry marked landing route (`DEC-49`, `docs/design/shell/spec.md` line 5). Chose: picker for any module with a static workspace entry. Bead `-ngd` created and closed.
6. **Readiness check for specifications (late).** Found the sources-of-truth review Order items 2 to 5 unapplied and about two hundred PNG captures in `docs/design/` against the README's own rule. Applied items 1 to 4, left item 5 to the design owner because the next handover would overwrite a trim made in the copy. Bead `-4hf` created and closed. Review file marked "Applied on 2026-09-18" above its Order list.
7. **Final readiness answer.** Ready. Nothing blocks `docs/specs/00-monorepo-foundation.md`.
8. **Accessibility and token audit, then two fix passes (after this file was first written).** An audit returned twelve findings against the design. Applied to `docs/design/design-system/tokens.md` and five section specifications: a solid `ring-blue-500` in place of `ring-blue-500/60`, which measured 2.11:1 and failed 1.4.11; `blue-400` pinned as the dark brand text, because `blue-600` measures 3.90:1 on gray-950; a button state matrix with four variants and four states including loading; `gray-500` input borders, separated from decorative hairlines; six named contrast pairs in Branding in place of one fill check, because a color can pass the fill and fail as text on the white navigation pill; the tint strip removed, with hover and press as 90% and 80% opacity; a labeled OTP group; keyboard activation for clickable rows; and self-hosted fonts. The design agent then fixed the components and retook every capture. Nine spots remained and were fixed directly: the Administrator pill to gray, and eight `dark:text-blue-300` uses to `blue-400`. `npx tsc -b` and `npx eslint src` were clean at the end.
9. **The design repository closed.** Captures and component source copied into `docs/design/`. The repository is to be deleted; its work was never committed to git, so this copy is the only record.

## Key Decisions

- **Category in core, not a second category system per module** (`DEC-51`). Rejected: separate module categories in core (two systems in one tree) and a core catalogue as landing page (reopens `DEC-49`). Trade-off: solutions loses a table it designed; a category delete can leave a dangling id in `solution_category` by design.
- **No new core permission key for the Modules page** (`DEC-50`). Rejected `core:modules:manage` because `DEC-23` fixes six core keys and the page changes the same rows as Tenant Settings. Revisit with the separation-of-duties revisit in `DEC-23`.
- **No role assignment on the Modules page**. The Roles screen is the one writer of `role_assignment` (`DEC-39`). Revisit: an assign control that calls the roles procedure.
- **Modules-only counts on the Categories page** (`DEC-51`). Rejected: a core read of `solution_category` (breaks the module contract guard "core's tree builder reads only `category` and `tenant_module`"), a count from navigation entries (filtered per person). Revisit: a member-count extension point a module answers.
- **Picker shows for any module with a static workspace entry** (`DEC-50`). The solutions hub is such an entry, so setting a category moves the hub entry under that heading. An admin-only module with no workspace entry has no picker.
- **Design copy stays the design's** (headings, sort order, Off pill, confirm and audit wording). Recorded on the "Left to the design" lines; a later document can override.
- **Captures and component source live in `docs/design/`** (revised 2026-09-18). The earlier text-only handover rule assumed a design tree that keeps them. The design repository is being deleted, so this repository holds everything: captures beside each section, components under `reference/` marked as a visual reference in a different stack.
- **Working records go to `docs/design/history/`**, not deleted, each with a first line that says it is a record. Reason: old decisions are useful; a reader must see the marker.
- **There is no next handover** (revised 2026-09-18). The design tree is gone, so a "Design files affected" line now names a file to edit here, not a message to send. Edit `docs/design/` directly.

## Evidence & Data

### Beads this session

| Bead | Title | State |
| --- | --- | --- |
| genie-ops-center-v2-9ko | Record DEC-50 and DEC-51 (module switch, visibility, category in core) | closed |
| genie-ops-center-v2-ngd | Settle two contract points: category counts and the Solutions category picker | closed |
| genie-ops-center-v2-4hf | Apply the sources-of-truth review to docs/design | closed |
| genie-ops-center-v2-4lm | Write Section 0 specification in docs/specs/ and the realm runbook | open, P2, next |
| genie-ops-center-v2-0gr | Session cookie `__Host-` prefix and trusted proxy IP in Better Auth config | open, P4, backlog |
| genie-ops-center-v2-bqi | Settle module name: contracts vs agreements before the module starts | open, P4, waits on discovery |

### Decisions recorded this session

| DEC | One line | Designed in | Implemented |
| --- | --- | --- | --- |
| DEC-49 | Landing page is the solutions hub; landing-route flag on one entry; no Dashboard | Section 0, Navigation row | Section 3 item 4, Section 4 item 1 |
| DEC-50 | Modules page: enabled switch, category picker, access column; `<id>:use` contract; `<Display name> user` role | Section 0, Permission keys, Default roles, Navigation rows | Section 3 item 11 |
| DEC-51 | `category` core table, Categories page, one tree `{ pinned, entries }` with `categoryId` | Section 0, Navigation row | Section 3 item 11, Section 4 item 1 |

### Core tables touched

| Table | Change |
| --- | --- |
| `tenant_module` | gained `category_id` (nullable, core `category` id); `enabled` written by one core procedure shared by page and CLI |
| `category` | new core table: id, name (unique), position, created_at, updated_at, under `### Navigation` in `data-shape.md` |
| `solution_category` (module) | `category_id` is a core `category` id; missing id means no category; one category per solution, many-to-many changes the key only |

### Core permission keys (unchanged, six)

`core:people:manage`, `core:groups:manage`, `core:roles:manage`, `core:branding:manage`, `core:settings:manage`, `core:audit:read` (`DEC-23`). Solutions module keys: `solutions:admin`, `solutions:use`. Per-solution access is a `role_assignment` with scope `solution:<id>`.

### Navigation tree contract (module-contract.md, Navigation row)

```
{ pinned: Entry[] (at most six, ordered), entries: Entry[] }
Entry may carry categoryId: the id of a core `category` row
Core groups entries by its `category` table
Core places a module's static workspace entries under tenant_module.category_id
Core renders one tree, persists collapse state per device
Core never reads a module table to build the tree
A module treats a category id that no longer exists as no category
One workspace entry is marked the landing route (DEC-49)
```

### docs/design after cleanup

| Path | Holds |
| --- | --- |
| `README.md` | ownership rule, naming rule, standing check, handover rule, design-round table |
| `design-system/tokens.md` | fixed token layer (Section 3 item 1) |
| `shell/spec.md` | shell design (Section 3 item 4); line 5 names the Solutions hub as landing route |
| `sections/sign-in-and-tenant-pages/` | Section 1 (not-set-up page), Section 2 (sign-in, break-glass) |
| `sections/account-and-inbox/` | Section 2 (account, sessions), Section 3 (idle timeout, empty state, overrides); inbox screen is Section 5 item 8 (later) |
| `sections/people-groups-and-roles/` | Section 2 |
| `sections/branding/` | Section 3 |
| `sections/audit-and-tenant-settings/` | Section 2 item 12 (audit reader), Section 3 (Tenant settings, Modules, Categories) |
| `sections/email-templates/` | Section 3 |
| `sections/solutions/` | Section 4 |
| `history/` | eight records: the seven above plus `a11y-token-pass-2026-09-18.md`, the design agent's report on the accessibility and token fix pass |
| `reference/` | 181 component files, `sections/` and `shell/`, with a `README.md` that marks them a visual reference in a different stack and not code to build on |
| `research/theming-2026-09-17.md` | evidence behind `DEC-47` |

### Section 0 work items (roadmap lines 6 to 43), the input for the next specification

| Item | Subject | Decisions |
| --- | --- | --- |
| 1 | pnpm workspaces with Nx, `nx affected -t build test lint typecheck`, caching, project tags | |
| 2 | Shared config package: Node 26, TypeScript strict, oxlint, oxfmt, lefthook | |
| 3 | Module contract in core, placeholder module, stub `can()` granting only `placeholder.read` | `DEC-34` |
| 3a | `createTenantContext()` from the environment; two-context isolation test with Testcontainers | `DEC-34` |
| 4 | Module registry `apps/genie/src/modules.ts` generated from `MODULE_INCLUDE` | `DEC-22`, `DEC-33` |
| 4b | Migration histories per core and per module, migrator applies core then modules | `DEC-33` |
| 4a | Nx generators `module:new <capability>`, `tenant:new <slug>` | `DEC-22` |
| 5 | Docker image, `MODULE_INCLUDE` build arg, `scripts/build-customer-image.sh <slug> <version>`, startup migration under advisory lock with `LOCK_TIMEOUT_MS` default 120 s | `DEC-9`, `DEC-33` |
| 6 | Test infrastructure: Vitest, Testcontainers, Playwright at phone and desktop viewports, `pnpm seed` | `DEC-25` |
| 7 | TanStack Devtools behind `next/dynamic` and a `NODE_ENV === "development"` check | |
| 8 | CI: lint, typecheck, unit, integration per change; e2e per merge to `develop`; image per customer on release tag to GitHub Container Registry | `DEC-33` |
| 9 | `next-intl` scaffold, one English catalog | `DEC-13` |
| 10 | pino JSON logs with request id, tenant id, user id; `LOG_LEVEL`; stable error codes | `DEC-31` |
| 11 | Security headers: nonce CSP with `default-src 'self'`, `frame-ancestors 'none'`, per-request `frame-src` from module origins; HSTS preload; referrer policy; nosniff; minimal Permissions-Policy | `DEC-31` |

Section 0 definition of done (roadmap line 43): image builds, app boots against an empty database with only the core history, placeholder module passes every Section 0 contract point with the stub `can()` refusing every call except `placeholder.read`, three test layers green including the two-context isolation test, e2e at phone and desktop viewports.

### Review findings that touch Section 0 (from `docs/review-2026-09-17.md`)

| Finding | Outcome |
| --- | --- |
| Section 3 item 9 migration linter | `DEC-43`: Squawk on changed migration files plus `drizzle-kit check` in the PR pipeline, `squawk-ignore` comment for a deliberate contract, migrator logs pending count |
| Section 3 item 10 job worker | ADR 0007 and `DEC-33`: separate process from the same image, entrypoint flag |
| Section 4 stack corrections | Node 26 pinned (LTS 2026-10-28); TypeScript, TanStack Table 9, pino, Vitest, pnpm, oxfmt bumped; devtools need an environment guard and dynamic import; oxlint chosen over the Nx boundary rule with the corrected reason (`@nx/oxlint` bridge experimental) |
| Section 7 item 4 `can()` evaluation | `DEC-48`: one lazy loader per request, no cache across requests |
| Section 7 item 5 parent scopes | Record types row declares optional parent types and the resolver returns parents; `DEC-39` amended |
| Section 7 item 8 `tenant.yaml` vs `branding.seed.json` | no overlap; strict zod schema per file in `packages/core/src/lib/tenant-config/`, JSON Schema emitted to `deploy/schemas/` |
| Section 7 item 10 `IMAGE_TAG` | added to `environment-contract.md` as a Compose-only value |

### Architecture invariants every specification must hold (from `CLAUDE.md`)

| Invariant | Source |
| --- | --- |
| The database is the tenant: one deployment, one customer, one database, no `tenant_id` column, no tenant registry, no hostname routing | ADR 0007 |
| The application is hosting-agnostic; code never knows whether Genie or the customer hosts it | `DEC-33`, `DEC-35` |
| The image holds no credential; secrets enter at run time; `MODULE_INCLUDE` is the only build argument | `DEC-33` |
| Every read goes through `TenantContext`; readers expire after 10 seconds; no save invalidates them | `DEC-34`, `DEC-46` |
| Apps compose, never hold business logic; `apps/genie` standard, `customers/<slug>/app/` custom | repository-layout |
| One authorization seam, `can()` and `scopesFor()`; no bypass except break-glass | `DEC-39` |
| Modules use only the extension points in `module-contract.md`; a new need extends the contract in core in the same change | module-contract |
| Keycloak authenticates and supplies groups; the application authorizes | ADR 0004, ADR 0006 |
| Files go through `FileStorage`; default adapter stores bytes in `file_blob`; `s3` optional; the `file` row never records where bytes live | `DEC-20` |
| Open to extension, closed to modification: read every `Revisit` line a change touches; never remove a seam a `Revisit` depends on | vision principle 8 |
| Never branch on a tenant in code; a customer difference is branding, settings, roles, entitlement, module configuration, integration, new module, hosting choice, or custom app, in that order | repository-layout |

### Testing rules a specification must carry

- Three layers from Section 0: Vitest unit, Vitest integration against real Postgres through Testcontainers, Playwright end-to-end against one seeded deployment.
- Never mock the database. An integration test gets a disposable Postgres with the real migration history.
- Every module ships unit tests, integration tests for router and schema, factories for its tables, one end-to-end test for its main path. CI fails a module package without tests.
- Every section's definition of done includes an end-to-end test at a phone viewport and a desktop viewport (`DEC-25`).
- Standing tenant isolation test: two contexts against two databases in one process, the placeholder router through each, any crossing read fails. Never skipped (`DEC-34`).

### Conventions once code exists

- Branches `type/kebab-subject` from latest `develop`; never commit to `develop` or `main` directly.
- Conventional Commits, imperative, under 72 characters; PR to `develop` keeps commits; PR `develop` to `main` squash-merged.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` on the PR; e2e on `develop` before the PR to `main`.
- State: TanStack Query for server state, zustand for complex client state, `useState` for trivial. Forms: TanStack Form with the procedure's zod schema. Tables: TanStack Table. Debounce and queues: TanStack Pacer. Helpers: es-toolkit.
- `nx affected -t build test lint typecheck` locally before a PR; `nx run <project>:<target>` for one package. Never run package scripts directly across the repo.
- New dependency: add to `docs/core/tech-stack.md` with a one-line reason in the same change.

### Edits owed inside `docs/design/` (make them here; there is no design owner to ask)

1. `sections/audit-and-tenant-settings/types.ts`: drop `Category.solutionCount` (line 94) and the `ungroupedSolutionCount` prop (line 143), and the matching keys in `data.json` (lines 804 to 829). The Categories page shows one modules count pill per category and on the Other row. The delete confirm names the module count and says that solutions in the category lose their heading, without a number.
2. The category picker on the Modules page shows for every module with a static workspace entry. Solutions has one, its hub, so the picker stays on that row. A module with no static workspace entry shows no picker.
3. `sections/solutions/spec.md` line 44: replace each restated limit (name 80, description 500, the two types, the four statuses) with a citation of `docs/modules/solutions/README.md`.

Changing a specification here may leave a capture behind. `docs/design/reference/README.md` rule 5 covers that: where a capture and a component disagree, the component is newer.

## Code Analysis

No application code exists. Contract facts a specification must hold:

- Authorization seam: `can(user, permission, resource?)` for one resource, `scopesFor(user, permission)` for a list query (`DEC-39`). Section 0 ships a stub that grants only `placeholder.read`.
- `TenantContext`: built once at startup by `createTenantContext()`; holds the pool and environment values; Section 1 adds the file store and the settings, branding, entitlement readers (10-second expiry, no save invalidation, `DEC-46`). `pg` and `drizzle-orm/node-postgres` are banned imports outside core.
- Import direction: `ui` imports nothing internal; `core` imports `ui`; a module imports `core` and `ui`; the app imports everything; enforced by oxlint `no-restricted-imports` in `packages/config`.
- Folder rule inside `packages/core/src/` and every module `src/`: `lib/<name>/` for a mini-package, `utils/` for a stateless helper after stdlib and es-toolkit were checked, `services/<name>/` for application work. Every folder has a `README.md` that says what belongs there and never lists files. `packages/core/contracts` keeps its name.
- Module contract Permission keys row: `<id>:<action>` with labels; a module with a workspace entry declares `<id>:use` and requires it on every workspace entry (`DEC-50`). Default roles row: `<Display name> user` carrying `<id>:use`.
- Configuration schema: `configSchema` zod object limited to five field kinds (string, number, boolean, enum, string list), rendered by `ConfigForm` on Tenant Settings (`DEC-28`).
- Secrets: none in the image; enter from the environment at run time; `<NAME>_FILE` secrets rejected; `MODULE_INCLUDE` is the only build argument (`DEC-33`, `DEC-35`).
- Migration at start: advisory lock, `LOCK_TIMEOUT_MS` default 120000, stay unhealthy on failure (`DEC-9`).

## Files Changed

### Planning documents (this session)
- `docs/core/decision-log.md` — `DEC-49` (earlier), `DEC-50`, `DEC-51` appended; 2026-09-18: DEC-50 Decision gains the picker rule, Left-to-the-design line trimmed, Design files affected names `design/sections/audit-and-tenant-settings/spec.md` and `types.ts`; DEC-51 Decision gains the modules-only count, Design files affected names `types.ts` fields to drop, second Revisit for a member-count extension point.
- `docs/core/vision.md` — Decided rows `DEC-49`, `DEC-50`, `DEC-51`; `OPEN-8` closed; Module entitlements bullet names the Modules page.
- `docs/core/roadmap.md` — Section 3 item 4 (core categories), new item 11 (Modules and Categories pages, modules-only count), Section 4 item 1 (category ids in the one tree).
- `docs/architecture/module-contract.md` — Permission keys, Default roles, Navigation rows.
- `docs/architecture/data-shape.md` — `tenant_module.category_id`, `### Navigation` with `category`, module rule 2, relationships.
- `docs/modules/solutions/README.md` — categories moved to core; `solution_category` references core id; work item 4.
- `docs/review-2026-09-17-sources-of-truth.md` — "Applied on 2026-09-18" paragraph above Order.
- `docs/README.md` — design row status updated.

### Design handover copies (this session)
- `docs/design/README.md` — rewritten (ownership rule, naming, standing check, handover rule, design-round table, history and research notes).
- `docs/design/design-system/tokens.md` — line 3 points at `tenant_branding` in `data-shape.md` instead of deleted JSON files.
- Deleted: `docs/design/product-overview.md`, `product-roadmap.md`, `data-shape/data-shape.md`, `design-system/colors.json`, `design-system/typography.json`, every `*.png`.
- Moved to `docs/design/history/` with a header line: seven records listed in Evidence.

### Earlier in the session (unchanged since)
- `docs/runbooks/deployment.md`, `docs/architecture/environment-contract.md`, `docs/review-2026-09-17.md`.

## User Feedback & Preferences (REQUIRED — never omit)

- "i have forgotten an important requirement, user's custom modules should be able to turned on and off like solutions (chat, embedded) and control permissions like solutions" — then, firmer: "admin should be able to turn a custom module on and off like solutions in v1, and admin can control which user group can see the particular module and can move the module into a category just like solutions". V1 scope, not later.
- Chose "Category moves to core" when asked where the category lives.
- "fix those that dont require my decision" — settle contract points from existing decisions without asking; ask only when readings lead to materially different work.
- "lets address them" after a list of pending items: proceed with deletes and moves once listed.
- Standing rules: never name a customer; never reference the previous codebase; no notes in configuration files (`DEC-35`); credentials and secrets stay in the environment, never in images; `<NAME>_FILE` secrets rejected; deployment guide never mentions Coolify (other docs may); diagrams edited in `.json` and regenerated with archify, never edit HTML.
- Say "Genie Ops Center" for the product, never bare "Genie" (Genie is the company; "Genie operator", "Genie-hosted", "Genie holds", "genie-studio", "genie-ops" stay). Stored as a `bd remember` memory.
- Do not change any ADR. Do not renumber any `DEC` or `OPEN`.
- Superseded 2026-09-18: the design tree is being deleted and this repository owns the design. Edit `docs/design/` directly.
- `packages/core/contracts` keeps its name. Every folder has a `README.md` that says only what belongs there and never lists files.
- Decisions need trade-offs (memory `feedback-decisions-need-tradeoffs`): every `DEC` records gains and costs; settle design points one at a time.
- On "I don't understand": build a temporary archify HTML diagram with a Haiku subagent under `/home/kenan/.claude/jobs/<job>/tmp/`, open with `xdg-open`, delete afterwards, never under the repository (memory `feedback-explain-with-temp-html`).
- Output style: simple English, replies of five sentences or fewer, prose only, no contractions, no em-dashes. Ponytail mode full (shortest diff, no unrequested abstractions). Prefix shell commands with `rtk`. Use `mcp__plugin_woz_code__Search` and `Edit` over Bash for reads and edits.
- Beads: `bd` for tasks, `bd remember` for project memory, conservative profile, never commit or push unless asked.
- Global: push back when a better alternative exists; look up current library docs (context7) before writing against a library.

## Where We're Going

1. Write `docs/specs/00-monorepo-foundation.md` under bead `-4lm`. Source: roadmap Section 0 items 1 to 11 and its definition of done, `repository-layout.md`, `environment-contract.md`, `module-contract.md`, `data-shape.md` deployment tables, `tech-stack.md`, `DEC-9`, `DEC-13`, `DEC-22`, `DEC-25`, `DEC-31`, `DEC-33`, `DEC-34`, `DEC-35`, `DEC-43`. Name every folder's `README.md` obligation, the placeholder module, the stub `can()`, the two-context isolation test, the CI gates, and the security headers.
2. Get the specification approved, then write its ticket breakdown in `docs/tickets/`.
3. Write the Keycloak realm runbook under `docs/runbooks/` (Section 1 item 5 and Section 2 item 9 depend on it), same bead.
4. Make the two owed edits in `docs/design/` yourself, listed above. There is no design owner to wait for.
5. Specifications for Sections 1 to 5 follow in roadmap order, each named `NN-<section>.md`.

## Risks & Blockers

- `bd remember` and beads memory hold one project memory only (product naming). Rules above live in this handoff and in `CLAUDE.md`.
- The docs are not tracked in git in this working copy. A wrong `rm` has no undo. Look before deleting.
- A specification and its captures can drift, because a capture is a moment. `docs/design/reference/README.md` rule 5 settles which wins: the component is newer than the capture.
- The design repository was never committed to git. If it is already deleted, `docs/design/` is the only copy of the components and the captures.
- Bead `-bqi` (contracts vs agreements module name) waits on customer discovery and does not block core specifications.

## Open Questions

- Specification format: `docs/specs/README.md` fixes only the file name `NN-<section>.md`. The next session picks the section layout (goal, scope, work items with acceptance, definition of done, decisions cited, open items) and records it in that README so later specifications match.
- Whether the Section 0 specification and its tickets are one approval or two. Default: the specification is approved first, tickets after, as `docs/README.md` says.

## Quick Start for Next Session

```bash
# Restore context
cd /home/kenan/work/genie-ops-center-v2
rtk bd prime
rtk bd show genie-ops-center-v2-4lm
rtk bd update genie-ops-center-v2-4lm --claim

# Reference docs (read in this order)
# CLAUDE.md
# docs/README.md
# docs/core/vision.md
# docs/core/roadmap.md            (Section 0: lines 6-43)
# docs/core/decision-log.md       (DEC-9, 13, 22, 25, 31, 33, 34, 35, 43, 48)
# docs/architecture/repository-layout.md
# docs/architecture/environment-contract.md
# docs/architecture/module-contract.md
# docs/architecture/data-shape.md
# docs/core/tech-stack.md
# docs/specs/README.md

# Verify current state
rtk bd list --status=open        # expect -4lm, -0gr, -bqi
ls docs/specs                    # expect README.md only
ls docs/design                   # expect README.md design-system history reference research sections shell

# Next action
# Write docs/specs/00-monorepo-foundation.md from roadmap Section 0,
# then record the specification layout in docs/specs/README.md.
```

## Session Closed
**Closed at:** 2026-09-18
**Commit:** none (the docs are not tracked in git in this working copy)
**Session status:** Handed off to next session
