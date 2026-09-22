# Genie Ops Center v2

Enterprise application platform: one repository, one Dockerfile, shared core, business modules. Every customer runs its own deployment from its own image, which carries core plus only that customer's modules, with one database and one Keycloak realm, hosted by Genie or by the customer (ADR 0007, `DEC-33`). Read Beads and the current ticket evidence for implementation and acceptance status.

## Execution authority

Read the current ticket and owner authorization before acting. An approved scoped local commit does not require an integration window. Local integration into `develop` requires separate owner approval and a reserved single-writer window; code push, publication, deployment, host-service changes and worktree deletion remain separately authorized actions.

For each new assignment, use `wt` to create a new dedicated branch/worktree from current local `develop`, regardless of existing worktrees. A continuation preserves its already-assigned worktree and work; it is not a new assignment. This local-dispatch requirement does not make `wt` a prerequisite for project scripts, tests, CI or portable setup instructions.

Beads owns shared ticket status, claims, blockers and follow-up work. Task-local execution checklists, concrete plans and recovery ledgers may support the chosen workflow; they do not replace Beads or authorize sibling-ticket work.

## Read first

1. `docs/core/vision.md`: the platform, decisions (`DEC-n`), open questions (`OPEN-n`).
2. `docs/core/roadmap.md`: core sections in dependency order, each with a definition of done.
3. `docs/architecture/data-shape.md`: the deployment tables, the core tables, and the rules for module tables.
3a. `docs/architecture/access-model.md`: how sign-in, the `groups` claim, group-to-role mapping, and local groups work. Read before touching identity or access.
4. `docs/core/tech-stack.md`: every dependency and why.
4a. `docs/core/decision-log.md`: questions decided by default, with what is designed in now and implemented later. Revisit there before proposing a change.
5. `docs/modules/README.md`, then `docs/modules/<module>/README.md` for the module you touch.

Core documents describe the platform only. Anything specific to one module lives in `docs/modules/<module>/`. Never add module content to a core document.

`docs/adr/` holds the architecture decision records. Read the relevant ADR before proposing to change a foundation choice, and write a new ADR (next number, same format) when a decision is hard to reverse, surprising without context, and the result of a real trade-off.

`docs/README.md` maps the folders. Do not start a roadmap section without an approved specification in `docs/specs/`.

## Writing rules for documents

- Never name a customer. Write "the first customer" or "a customer".
- Never reference the previous codebase. Describe the product as it will be.
- Write "identity provider", not "Entra", unless Entra is the specific example.
- Name a module by its capability, never by its customer.
- Platform-level unsettled points go into `docs/core/vision.md` as `OPEN-n`; module-level ones go into that module's `README.md`. Questions only the customer can answer go into the module's `discovery.md` as `D-n`; any design or implementation path that depends on one is marked `DEFERRED (D-n)` and is not started until the answer is recorded.
- Diagrams: edit the `.json` source in `docs/architecture/diagrams/` and regenerate the HTML with the archify skill. Never edit the HTML.

## Architecture invariants

- The database is the tenant. One deployment, one customer, one database. No `tenant_id` column in any table, no tenant registry, no hostname routing.
- The application is hosting-agnostic. Code never knows whether Genie or the customer hosts it.
- The image holds no credential and no secret. Secrets enter at run time from the environment. `MODULE_INCLUDE` is the only build argument (`DEC-33`).
- No code reads the database, settings, branding, entitlements, or files except through the `TenantContext` object built once at startup (`DEC-34`). Settings, branding, and entitlements are cached readers on that object that expire after 10 seconds; nothing else caches them, and no save invalidates them (`DEC-46`). Core exports no connection singleton; `pg` and `drizzle-orm/node-postgres` are banned imports outside core.
- Apps contain no business logic; they compose. `apps/genie` is the standard composition, and a custom app under `customers/<slug>/app/` for a customer that needs a different experience composes the same core, ui, and modules. `packages/modules/*` never import each other or any app. `packages/core` imports only `packages/ui`. A core capability that works only inside `apps/genie` is a defect.
- Authorization goes through one seam: `can(user, permission, resource?)` for one resource, and `scopesFor(user, permission)` for a list query (`DEC-39`). No permission check or scope filter elsewhere. No bypass except the break-glass account.
- Modules use only the extension points in `docs/architecture/module-contract.md`. A module that needs more gets the contract extended in core, in the same change, never a workaround inside the module.
- Keycloak authenticates and supplies groups. The application authorizes.
- Files go through the `FileStorage` interface. The default adapter stores bytes in the database; the `s3` adapter is optional per deployment (`DEC-20`). Modules never write bytes to their own tables. Nothing outside the adapters touches `file_blob` or the bucket, and the `file` row never records where its bytes live, so that a future `genie-ops files migrate` can copy blobs between adapters (`DEC-20`). Do not close this path.
- Open to extension, closed to modification (vision principle 8). A deferred capability is recorded with the path that reopens it and the guard that keeps the path open. Before a change, read the `Revisit` line of every decision it touches, and do not remove a seam, a template field, or an indirection that a `Revisit` line depends on.

## Monorepo

- pnpm workspaces link the packages. Nx runs the tasks: use `nx affected -t build test lint typecheck` locally before a pull request, and `nx run <project>:<target>` for one package. Do not run package scripts directly across the repo.
- Package layout: `apps/genie`, `packages/core`, `packages/ui`, `packages/modules/<capability>`, `packages/config`, `tools/generators`, `customers/<slug>/` (that customer's deployment configuration, module include list, and generated compose file, plus a custom app only if needed; never a module), `deploy/` (Dockerfile, stack template, and Keycloak templates), `scripts/` (build a customer image, local seed). New modules are generated with `nx g @genie/module:new <capability>` and tagged `module`; new tenants with `nx g @genie/tenant:new <slug>`. Everything is owned by Genie Ops Center; there are no customer repositories. Every folder named in that tree holds a `README.md` that says what the folder is for and what must not go in it; the generators write it and CI fails a package without one. Full tree and the eight levels of customer variation: `docs/architecture/repository-layout.md`. Every environment variable the image reads, with defaults: `docs/architecture/environment-contract.md`.
- Where code goes, by three questions, in `packages/core/src/` and in every module's `src/`. Is it a mini-package with its own API that could stand alone? `lib/<name>/`. Is it a small generic stateless helper? `utils/`, only after the standard library and es-toolkit were checked, one file per topic, never a wrapper around a library function. Does it do work for the application, business logic or an integration (the mailer, the file store, the event bus, a connector)? `services/<name>/`. The three folders exist so that a reader, human or agent, searches one known place before writing a duplicate. A file or folder name says what it does; the folder's `README.md` says only what belongs there and never lists files.
- Never branch on a tenant in code. A customer difference is branding, settings, roles, an entitlement, module configuration, an integration, a new capability module, a hosting choice, or a custom app, in that order.
- Import direction: `ui` imports nothing internal, `core` imports `ui`, a module imports `core` and `ui`, the app imports everything. A module never imports another module. Enforced by the oxlint `no-restricted-imports` configuration in `packages/config`; `nx graph` shows it.

## Dependencies

- Do not hand-roll what a well-maintained library already does. Check the standard library first, then `docs/core/tech-stack.md`, then es-toolkit, then a library with active maintenance and a compatible license. Write a helper only when none of those fits.
- A new dependency must be added to `docs/core/tech-stack.md` with a one-line reason, in the same change that introduces it.
- Look up current documentation before writing code against a library. Assume memory of its API is outdated.

## Toolchain

These choices are settled. Do not substitute one without approval.

- Format with **oxfmt**. Never Prettier, never Biome, never a formatting rule inside the linter. The configuration is `oxfmt.config.ts` at the root, which re-exports `packages/config/src/oxfmt/`. Option names are Prettier's names: [configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html). Never write an option that equals its documented default. The defaults already match this repository: 2 spaces, semicolons, double quotes, trailing commas everywhere, print width 100, final newline. oxfmt has built-in import sorting, Tailwind class sorting, and `package.json` key sorting, so never add a plugin for any of the three.
- Lint with **oxlint**. Never ESLint, never typescript-eslint, never a second linter. The configuration is `oxlint.config.ts` at the root, which re-exports `packages/config/src/oxlint/`. The `no-restricted-imports` overrides in that file are what enforce the import direction. Extra rules come from the vendored anti-slop source in `packages/config/oxlint/anti-slop/`, which keeps its licence and its provenance record. The Effect rules stay off.
- Typecheck with **tsc** in strict mode, run as `tsc --noEmit` per package. oxlint does not replace it. A linter checks patterns and a compiler checks types, so both run.
- Run all three through Nx, never as a bare package script across the repository: `nx affected -t build test lint typecheck`.

## Testing

- Four layers from Section 0: Vitest unit tests, Storybook/Vitest browser component tests, Vitest integration tests against a real Postgres through Testcontainers, and Playwright end-to-end tests against one seeded deployment.
- Before creating, changing, or integrating UI, follow [the Storybook and UI TDD workflow](docs/architecture/ui-development.md): documented stories, meaningful failing behavior tests, then minimal implementation before app consumption. Stories do not replace integration/E2E proof. Until the Section 0 harness exists, report that limitation rather than claiming test execution.
- Never mock the database. An integration test gets a disposable Postgres with the real migration history.
- Every module ships unit tests, integration tests for its router and schema, factories for its tables, and at least one end-to-end test for its main path.
- Every roadmap section's definition of done includes an end-to-end test that proves it, run at a phone viewport and a desktop viewport. A screen that only works on desktop is a defect (`DEC-25`).
- Tenant isolation has a standing integration test: two tenant contexts against two databases in one process, the placeholder module's router run through each, and any read that crosses fails the test (`DEC-34`). The Section 0 stub `can()` grants only `placeholder:read`, so the placeholder's read procedure is the one path the test proves. It never gets skipped.

## Conventions (carried forward, apply once code exists)

- Branches: `feature/kebab-subject`, `bugfix/kebab-subject`, or `chore/kebab-subject`. No other prefix. Create the branch from the latest `develop`. Never commit straight to `develop` or `main`. Use `wt` as specified in Execution authority.
- This file and `AGENTS.md` are tracked. Edit them in the assigned worktree and mirror substantive shared instructions across both.
- Commits and pull request titles: Conventional Commits — `type(scope): subject`, imperative, under 72 characters; the body explains why. Allowed types and detailed rules are in the "Commits and Pull Request Titles" section of `AGENTS.md`.
- Integration: use a pull request from the feature branch to `develop`, or owner-approved local integration through `wt` in the reserved window. When `develop` is ready for production, open a pull request from `develop` to `main`. `main` is the production branch and receives changes only through that pull request.
- Merging: pull requests into `main` are squash-merged, so `main` history is one commit per release carrying the pull request's Conventional Commits title. Pull requests into `develop` keep their commits.
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` pass on the pull request before merge, and end-to-end tests pass on `develop` before the pull request to `main`.
- State: server state in TanStack Query, complex client state in zustand, trivial local state in `useState`.
- Forms: TanStack Form, with the procedure's zod schema passed directly as the validator (Standard Schema, no adapter). Tables: TanStack Table. Debounce, throttle, rate limit, and queues: TanStack Pacer. Stateless helpers: es-toolkit.
- Devtools: TanStack Devtools is mounted once in `apps/genie` for development. Add a panel for new client state rather than logging to the console.
- Use native `pnpm`/Nx, Git and `bd` commands in project scripts, tests, CI and portable documentation. RTK and other personal agent tools are optional wrappers for local command execution, not repository prerequisites; never require them or personal installation paths in those project surfaces.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for shared project task tracking. Task-local execution plans and recovery ledgers follow the Execution authority section.
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for shared task tracking. Honor existing scoped commit and sync grants from the current dispatch; otherwise request authorization. Code push remains separate. At handoff, report changed files, validation and any outstanding authorization.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
