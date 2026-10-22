# Agent Instructions

## Execution authority

Read the current ticket and owner authorization before acting. An approved scoped local commit does not require an integration window. Local integration into `develop` requires separate owner approval and a reserved single-writer window; code push, publication, deployment, host-service changes and worktree deletion remain separately authorized actions.

Start in the session's assigned checkout. If it is already the task's dedicated worktree, including one created by Orca, reuse it. Only when outside a task worktree, use `wt` to create a dedicated branch/worktree from current local `develop`. Verify branch, accepted baseline and task ownership before editing. If the existing worktree belongs to another task or contains conflicting work, stop and ask; do not overwrite it or automatically create another worktree. A continuation preserves its assigned worktree and work. This local-dispatch requirement does not make `wt` a prerequisite for project scripts, tests, CI or portable setup instructions.

Beads owns shared ticket status, claims, blockers and follow-up work. Task-local execution checklists, concrete plans and recovery ledgers may support the chosen workflow; they do not replace Beads or authorize sibling-ticket work.

Every bead has a parent epic, open or closed. File a bead with `--parent <epic>`: section work under its section epic, tooling, CI, dependencies and flaky tests under the Maintenance epic, specs, decisions and design docs under the Planning epic, and later ideas and owner reminders under the Backlog epic. When no epic fits, create a new epic first and parent the bead to it. A backlog item gets status `deferred`, not `open` at P4, because the Beads board shows only `deferred` items under Backlog.

Name epics in one pattern. A roadmap section epic is `Spec <n>: <roadmap section title in lower case>`, where `<n>` is the roadmap section number, also before `docs/specs/` holds that spec (for example `Spec 6: module platform (core seams for approvals)`). Never write `Section <n>:`. The standing epics are `Planning: ...`, `Maintenance: ...` and `Backlog: ...`. A one-off topic epic is `<Topic>: <goal>`.

Keep `docs/tech-plans/` and `docs/tickets/` current. Every approved specification gets a technical plan `docs/tech-plans/<nn>-<slug>.md` before its tickets start, and its row in `docs/tech-plans/README.md` changes when its status changes. When the owner approves a ticket breakdown, write `docs/tickets/spec-<n>/README.md` (ticket, bead, dependencies, folded beads) and one `<nn>-<slug>/index.md` per ticket with its scope and acceptance, in the same change that records the approval. When a ticket's scope, dependencies or bead changes, update its file and the index. Beads still owns status and claims.

## Portable tooling

Use native `pnpm`/Nx, Git and `bd` commands in project scripts, tests, CI and portable documentation. RTK and other personal agent tools are optional wrappers for local command execution, not repository prerequisites; never require them or personal installation paths in those project surfaces.

## UI development

Before creating, changing, or integrating UI, read and follow [the Storybook and UI TDD workflow](docs/architecture/ui-development.md). Develop documented stories and failing behavior tests one slice at a time, make them pass before app consumption, and retain separate integration/E2E proof. Section 0 establishes this tooling; until it exists, report the missing harness rather than claiming tests passed.

### Storybook MCP

Start Storybook with `nx run @genie/storybook:storybook` (it serves `http://127.0.0.1:6006`). Its MCP endpoint is `http://127.0.0.1:6006/mcp`, registered in `.mcp.json` as `genie-storybook`. If Storybook is not running, the tools are unavailable; start it rather than guessing.

- When working on UI components, use the `genie-storybook` MCP tools to read component documentation before you use or change a component.
- Never invent component properties. Query `docs-list` for the documented components, then `docs-show` for the component you use, and use only the properties and examples it lists.
- Before you write or edit a story, call `get-storybook-story-instructions`.
- Before writing a new UI component, check `packages/ui` through these tools, then the official shadcn registry, then [UI component sources](docs/architecture/ui-component-sources.md). Reuse a library component when one fits. Write one only when none does.
- Story names can differ from property names, so check every property against `docs-show`.
- If a property is not documented, ask instead of guessing.
- Check your work with `test-run` on the stories you touched.

### shadcn MCP

The `shadcn` MCP server (in `.mcp.json`, `.codex/config.toml` and `opencode.json`) searches, views and gives add commands for the registries under `registries` in `packages/ui/components.json`. Use it for the registry steps of the order above. To adopt a new registry, add its namespace to that block, as [UI component sources](docs/architecture/ui-component-sources.md) describes.

TanStack Devtools is mounted once, in `apps/genie/src/devtools/`, and only in development. Add a panel there for new client state rather than logging to the console. Every devtools package stays a development dependency, and `apps/genie/testing/devtools-exclusion.test.ts` fails if any of them reaches the production build. That folder's `README.md` holds the rest, including the rule for adding a probe to the exclusion test.

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

> **Architecture in one line:** Issues live in a local Dolt database
> (`.beads/dolt/`); cross-machine sync uses `bd dolt push/pull` (a
> git-compatible protocol), stored under `refs/dolt/data` on your git
> remote — separate from `refs/heads/*` where your code lives.
> `.beads/issues.jsonl` is a passive export, not the wire protocol.
>
> See [SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md)
> for the one-screen overview and anti-patterns (don't treat JSONL as the
> source of truth; don't `bd import` during normal operation; don't
> reach for third-party Dolt hosting before trying the default).

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Commits and Pull Request Titles

Every commit message and every pull request title follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format: `type(scope): subject`, scope optional.

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Subject: imperative mood, lowercase, no trailing period, whole line under 72 characters.
- Scope: the area touched — a package (`core`, `ui`, a module capability) or `docs`, `deploy`, `scripts`. Omit when no single area fits.
- Breaking change: `!` after the type or scope (`feat!:` / `feat(core)!:`) plus a `BREAKING CHANGE:` footer saying what breaks and how to migrate.
- Body: include one when the why is not obvious from the subject; explain the reason, not the diff.
- Pull request titles use the same format; a squash merge takes its commit message from the pull request title.

## Dependencies

- Do not hand-roll what a well-maintained library already does (vision principle 10). We keep the code we write and maintain as small as possible. Before you write a helper, a component, a renderer or an engine, research what exists: the standard library, then `docs/core/tech-stack.md`, then [es-toolkit](https://es-toolkit.dev/), then a library with active maintenance and a compatible license. For UI, also [UI component sources](docs/architecture/ui-component-sources.md). Write your own code only when none fits, and name the libraries you considered and why each did not fit in the commit body.
- A new dependency must be added to `docs/core/tech-stack.md` with a one-line reason, in the same change that introduces it.
- Look up current documentation before writing code against a library. Assume memory of its API is outdated.

## Toolchain

These choices are settled. Do not substitute one without approval.

- Format with **oxfmt**. Never Prettier, never Biome, never a formatting rule inside the linter. The configuration is `oxfmt.config.ts` at the root, which re-exports `packages/config/src/oxfmt/`. Option names are Prettier's names: [configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html). Never write an option that equals its documented default. The defaults already match this repository: 2 spaces, semicolons, double quotes, trailing commas everywhere, print width 100, final newline. oxfmt has built-in import sorting, Tailwind class sorting, and `package.json` key sorting, so never add a plugin for any of the three.
- Lint with **oxlint**. Never ESLint, never typescript-eslint, never a second linter. The configuration is `oxlint.config.ts` at the root, which re-exports `packages/config/src/oxlint/`. The `no-restricted-imports` overrides in that file are what enforce the import direction. Extra rules come from the vendored anti-slop source in `packages/config/oxlint/anti-slop/`, which keeps its licence and its provenance record. To update it from upstream, use the `install-anti-slop` skill (installed for Claude Code, Codex and OpenCode). It merges upstream changes with local ones and updates `PROVENANCE.md`. Never re-copy the folder by hand. The Effect rules stay off.
- Typecheck with **tsc** in strict mode, run as `tsc --noEmit` per package. oxlint does not replace it. A linter checks patterns and a compiler checks types, so both run.
- Run all three through Nx, never as a bare package script across the repository: `pnpm gate:fast` while working, and `pnpm gate:merge` (the fixed list develop CI runs) before every merge into `develop`.

This file and `CLAUDE.md` are tracked. Edit them in the assigned worktree and mirror substantive shared instructions across both.

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

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for shared project task tracking; task-local execution plans and recovery ledgers do not replace it.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->
