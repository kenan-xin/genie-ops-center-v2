# S0-01 evidence record

Historical branch evidence. Current integrated acceptance is recorded in [integrated-acceptance.md](integrated-acceptance.md); the original commands, versions and outcomes below retain their original scope.

This record states what was run, what it printed, and what it did not prove. Every result below comes from a command executed in this worktree during this task. A check that was not run is named in "Not proved by this ticket".

## Revisions

| Item | Value |
| --- | --- |
| Branch | `feature/s0-01-workspace-and-build-inputs` |
| Integrated base revision | `7d68e91` (`7d68e9161026fd65c0de83dcda15fd17da7d5e37`), `docs: index new folders in the tree readme`, merged from `develop` |
| Head described by this record | `57bf7ae` (`57bf7aec5bb30b56bf59d269de116e907a4139a9`), `fix(config): close the module package-name gap in the import boundaries` |
| Commits on the branch over base | 18, measured as `git rev-list --count 7d68e91..57bf7ae` between the base and the head named above |

This record was written one commit after the head it describes. Every gate result below was measured at `57bf7ae` before the evidence commit existed. The evidence commit itself touches only this file, so the numbers stay checkable against the tree it names. To re-derive any number, check out `57bf7ae` or diff against it.

An earlier revision of this record described head `73ed55a` at 13 commits. Four commits landed after it, including one that changed the formatter configuration and reformatted the tree, and one that added the affected graph and cache tests. Every gate number in that revision described a tree that no longer existed, so the whole record was re-measured at the new head.

## Installed tool versions

Read from `pnpm list --depth=0 -r`, then confirmed against each binary's own version output. These are the installed versions, not the manifest ranges.

| Tool | Installed | Source |
| --- | --- | --- |
| pnpm | 12.4.2 | `pnpm --version` |
| Node.js | 26.9.0 | `node --version` |
| nx | 23.2.1 | `pnpm list`, confirmed by `pnpm exec nx --version` |
| oxlint | 1.83.0 | `pnpm list`, confirmed by `pnpm exec oxlint --version` |
| @oxlint/plugins | 1.83.0 | `pnpm list` |
| oxfmt | 0.68.0 | `pnpm list`, confirmed by `pnpm exec oxfmt --version` |
| typescript | 7.0.2 | `pnpm list`, confirmed by `pnpm exec tsc --version` |
| vitest | 5.0.1 | `pnpm list`, confirmed by `pnpm exec vitest run` banner |
| tailwindcss | 4.3.3 | `pnpm list` |
| lefthook | 2.1.14 | `pnpm list`, confirmed by `pnpm exec lefthook --version` |
| @types/node | 26.6.2 | `pnpm list` |

Every package repeats oxlint 1.83.0 and vitest 5.0.1 from the root, with no second version anywhere in the tree.

## The project graph

`pnpm exec nx show projects --json` enumerates exactly five projects.

| Project | Root | Tag |
| --- | --- | --- |
| `@genie/app` | `apps/genie` | `app` |
| `@genie/core` | `packages/core` | `core` |
| `@genie/ui` | `packages/ui` | `ui` |
| `@genie/config` | `packages/config` | `config` |
| `@genie/generators` | `tools/generators` | `tooling` |

No project is tagged `module`. No module package exists yet. S0-04 owns the first one. The hygiene test checks every enumerated project against `classifyProject`, and `classifyProject` covers all six classifications, so an untagged or wrongly tagged project fails the test rather than passing silently.

Dependency edges from the Nx graph: `@genie/app` depends on `@genie/config`, `@genie/core`, `@genie/ui`. `@genie/core` depends on `@genie/config`, `@genie/ui`. `@genie/ui` depends on `@genie/config`. `@genie/generators` depends on `@genie/config`. `@genie/config` depends on nothing. Every edge comes from a real `workspace:*` dependency in a `package.json`. No `implicitDependencies` entry exists in the repository.

## Gate commands and outcomes

All commands ran in this worktree at head `57bf7ae`. The first three runs below follow `pnpm exec nx reset`, so they start from an empty cache.

| Command | Projects with the target | Outcome | Real task count |
| --- | --- | --- | --- |
| `pnpm exec nx run-many -t test --skip-nx-cache` | 5 | Pass, exit 0 | 5 tasks ran, 6.0 seconds |
| `pnpm exec nx run-many -t test` (immediately after the cold run) | 5 | Pass, exit 0 | 5 tasks re-ran, 6.0 seconds, `Cache: 0/5 hit`. `--skip-nx-cache` also skips writing, so this run had nothing to read. It wrote the entries |
| `pnpm exec nx run-many -t test` (the run after that) | 5 | Pass, exit 0 | 5 of 5 tasks read from cache, 18 milliseconds |
| `pnpm test` | 5 | Pass, exit 0 | 5 tasks, 5 of 5 from cache |
| `pnpm lint` | 5 | Pass, exit 0 | 5 tasks, 5 re-ran for real, 829 milliseconds, because the test gate above had invalidated them |
| `pnpm exec nx run-many -t typecheck --skip-nx-cache` | 5 | Pass, exit 0 | 5 tasks ran, 619 milliseconds |
| `pnpm build` | 0 | Exit 0, printed `No tasks were run` | 0 tasks |
| `pnpm run format:check` | not a task, one root command | Pass, exit 0 | 60 files checked |

Unit test counts by package, from per-package `vitest run` invocations: `@genie/config` 42, `@genie/generators` 46, `@genie/core` 1, `@genie/ui` 1, `@genie/app` 1. Total 91 unit tests, all passing, plus one test file each for core, ui and app that proves the entrypoint loads without a side effect.

### The build gate is unproven

`pnpm build` exited 0 and ran nothing. Nx printed `No tasks were run`. No project registers a `build` target at skeleton stage. Exit 0 with zero tasks is not a passing build. This ticket does not prove the build gate. A build target exists only from S0-05 onward.

## Negative cases that failed as intended

The import boundaries live in `packages/config/src/oxlint/boundaries.test.ts`. It holds 23 `it` cases. 18 are negative cases that assert the lint run failed and name the exact rule message, 4 are positive cases that assert no `no-restricted-imports` diagnostic appears, and 1 proves the suite runs against the real repository root. All 23 pass. The anti-slop suite adds 6 cases, all passing.

Every negative case asserts on the `message` string of the entry under test, as written in `packages/config/src/oxlint/boundaries.ts`, in addition to the failure itself. Oxlint prints the message after `help:` in its diagnostic, so `toContain` on the output reaches the right rule. A failure for the wrong reason fails the test. Where two entries under one layer had shared a message, the messages were made distinct, so each assertion names exactly one entry.

The negative cases, with the message each asserts: `ui` importing `core` by package name, by relative spelling, and in a test file, against `ui imports nothing internal. Move the shared piece into ui.`. `ui` importing a core service subpath, against `only core opens a connection (DEC-34).`. `ui` importing the `drizzle-orm/node-postgres` binding, against the same driver message. `ui` importing a customer folder, against `ui imports no customer folder.`. A module importing another module by the slash spelling and by the real hyphen spelling `@genie/modules-beta`, both against `a module never imports another module.`. A module importing the application. A module importing `pg`. A module importing a core service subpath. All three of those cases assert `a module never imports an app.` or the module driver message, as each case names it. `config` importing any internal project, against `config imports no internal project (R-7a).`. `generators` importing a module implementation, against the tooling module message. `generators` importing the core runtime entrypoint, against the tooling entrypoint message. `generators` importing `pg`, against `tooling opens no database connection (DEC-34).`. `generators` importing an application, against `tooling never imports an app.`. An app importing `pg`, against `an app opens no connection (DEC-34).`. Contracts importing anything but `zod`, against `contracts import only zod and types (DEC-42).`.

The positive cases are: `core` importing `ui`, `core` importing `pg`, `generators` importing the build-safe `@genie/core/tenant-config` subpath, contracts importing `zod`.

### Why the module rules carry two spellings

A scoped package name holds exactly one slash. `@genie/modules/<id>` is therefore not a legal package name and can never appear in a real import. The realizable spelling of a module package is the hyphen form, `@genie/modules-<id>`, which the branch's own fixture `tools/generators/src/selection/__fixtures__/throwing-module/package.json` already used before this branch's final fix. The first version of the rules banned only the slash form, so every rule built on the `MODULES` group would have gone silent for package-name imports the moment S0-04 shipped the first real module. The fixture cases caught none of this, because they used the same unrealizable spelling the rule expected.

The fix adds `@genie/modules-*` and `@genie/modules-*/**` to the group and keeps the slash forms, because the boundary table in `docs/specs/00-monorepo-foundation.md` writes them and correcting an approved specification is out of scope for this ticket. A comment in `boundaries.ts` records why both spellings exist. A fixture case proves the hyphen form fails: `packages/modules/alpha` importing `@genie/modules-beta` is rejected with the module-to-module message. The `apps` group needs no equivalent fix, because apps are imported by path rather than by package name, and a comment in `boundaries.ts` says so.

The same review pass gave `packages/ui` the `CUSTOMERS` group, which the boundary table's first row had omitted, so `packages/ui` could import a customer folder until now. It also added the two missing cases for the `apps/**` and `customers/**` entry: tooling importing an app, and an app importing a database driver.

## Staged hooks

`lefthook.yml` ships at the repository root. It defines one `pre-commit` hook with two jobs. The `format` job runs `oxfmt` over the staged files matching `*.{ts,tsx,js,jsx,mjs,cjs,json}` and re-stages what it rewrites. The `lint` job runs `oxlint --config oxlint.config.ts` over the staged files matching the same list without `json`.

What was proved, by running `pnpm exec lefthook run pre-commit`, which is lefthook's own runner over the staged file set, in this worktree:

1. A staged TypeScript file with deliberately collapsed spacing was reformatted by the `format` job and the reformatted content was re-staged. The job passed.
2. A staged file whose formatting was already correct passed both jobs in 0.40 seconds.
3. A staged file that imports `@genie/core` from `packages/ui/__boundary__/` failed the `lint` job with the exact boundary diagnostic `ui imports nothing internal. Move the shared piece into ui.`, exit status 1, while the `format` job passed. The hook blocks a commit that violates the import direction.
4. A staged file that tripped an anti-slop rule failed the `lint` job with that rule's diagnostic. The hook runs the vendored rules, not only the built-in ones.
5. `--all-files` was also exercised once, against the whole tree. It failed on pre-existing files under `docs/design/reference/`, which is a reference copy and not part of this branch's scope. This run is recorded for completeness. It is not a pass and it is not a fail of the hook mechanism, which behaved correctly in all five runs.

What was not proved:

- The hook does not install automatically. `lefthook install` is not wired into `pnpm install`. The repository originally carried a `prepare` script that would have done it, and the script was removed, because on this machine `git config core.hooksPath` points at another checkout's `.beads/hooks` directory. An automatic install would have failed there, and `pnpm install` must not fail. `pnpm hooks:install` runs `lefthook install` and is the explicit opt-in.
- Automatic installation is therefore not proved, and no human or agent has resolved the `core.hooksPath` conflict on this machine. Lefthook's hooks will not run on a plain `git commit` here until a human resolves it. Until then the proof of the hook is the runner evidence above, not an observed `git commit` being blocked.

## Local cache proof

Sequence, each command run for real in this worktree, in this order.

1. `pnpm exec nx reset`. Exit 0. The daemon and the local cache were cleared.
2. `pnpm exec nx run-many -t test --skip-nx-cache`. Exit 0. 5 of 5 tasks ran for real. Run duration 6.0 seconds. The output said `Cache: Skipped (--skip-nx-cache)`.
3. `pnpm exec nx run-many -t test` immediately after. This run did not read the cache, because `--skip-nx-cache` also skips writing cache entries. It re-ran all 5 tasks in 6.0 seconds, `Cache: 0/5 hit`. This run wrote the entries.
4. `pnpm exec nx run-many -t test` again. Exit 0. The output said `Nx read the output from the cache instead of running the command for 5 out of 5 tasks.` Run duration 18 milliseconds. `Cache: 5/5 hit (100%)`. Nothing re-ran.

Conclusion: identical inputs replay 5 tasks from the local cache in 18 milliseconds instead of 6 seconds of real execution.

### A changed input busts the cache

1. A comment line was appended to `packages/config/src/vitest/unit.ts`.
2. `pnpm exec nx run-many -t test`. Exit 0. All 5 tasks re-ran, `Cache: 0/5 hit (0%)`.

The brief predicted that `@genie/config` and `@genie/generators` re-run. All 5 re-ran. The prediction was wrong in a harmless direction: `@genie/core`, `@genie/ui` and `@genie/app` are also downstream of `@genie/config` through the `^production` named input in `nx.json`, so a change to the shared preset correctly invalidates them too. All five projects consume the preset.

3. The comment was removed with `git checkout -- packages/config/src/vitest/unit.ts`.
4. One warm run to repopulate the entries, then `pnpm exec nx run-many -t test`. Exit 0. `Cache: 5/5 hit (100%)`. The working tree ended clean.

### A changed lint rule busts every project's lint cache

The `lint` target default in `nx.json` reads `["default", "^production"]`. Before the final fix on this branch it read `["default", "{workspaceRoot}/oxlint.config.ts"]`. That entry covered the four-line root shim, not the real rules, which live in `packages/config/src/oxlint/*.ts` and belong to no other project's input set. The `test` and `typecheck` targets already carried `^production`. The fix gives `lint` the same dependency input and drops the misleading shim entry.

The fix was proved by experiment, in this order, all runs for real:

1. `pnpm exec nx reset`, then one cold run and one warm run of `pnpm exec nx run-many -t lint`, then a second warm run. `Cache: 5/5 hit (100%)`, 18 milliseconds. The baseline replays.
2. A comment line was appended to `packages/config/src/oxlint/boundaries.ts`.
3. `pnpm exec nx run-many -t lint`. Exit 0. All 5 projects re-ran for real, `Cache: 0/5 hit (0%)`, 849 milliseconds. A rule change in `packages/config` invalidates the lint task of every project, as intended.
4. The comment was removed with the editor.
5. `pnpm exec nx run-many -t lint`. `Cache: 5/5 hit (100%)`, 18 milliseconds. The working tree ended clean.

Before the fix the same experiment would have replayed all 5 from cache, because the shim entry named a file the change had not touched. No such run was recorded, because the fix landed before this section was written. The claim rests on the input graph, not on a before-and-after timing.

### The repository-wide tests run inside one cached task

`tools/generators/src/workspace/hygiene.test.ts` and `tools/generators/src/workspace/affected.test.ts` assert facts about the whole repository: every project's tag, and which projects a change to a shared file marks affected. They run inside the `@genie/generators` `test` task, which Nx caches by input hash. Adding a new project elsewhere in the repository, one that the `@genie/generators` project does not depend on, does not change that hash. Nx would then replay the cached pass and the two tests would not observe the new project.

This is harmless today. There is no CI and no remote cache, so the cache lives only on the machine that produced it and a fresh checkout runs everything. It becomes a real gap the day CI or a shared remote cache arrives, because then one machine's cached pass could vouch for a repository state another machine's editor added a project to. The fix belongs to the ticket that introduces CI: either move these tests to a root-level target with the whole workspace as its input, or have CI run them with `--skip-nx-cache`. A reader should know the boundary of what the cached pass proves.

### No remote cache is in use

1. `nx.json` sets `"neverConnectToCloud": true`. `grep -iE "nxCloudAccessToken|nxCloudId" nx.json` finds nothing. No cloud key of any kind is present beyond `neverConnectToCloud`.
2. The environment holds no `NX_CLOUD` or `NX_APP_TOKEN` variable.
3. `pnpm exec nx run-many -t test --verbose` exited 0. A case-insensitive scan of its full output for `remote`, `cloud`, `nx.app` and `token` found zero lines. The only cache the output names is the local one, through `existing outputs match the cache, left as is`.

## Affected graph test

`tools/generators/src/workspace/affected.test.ts` asks Nx which projects a change to `packages/config/src/vitest/unit.ts` marks affected, and asserts the answer contains all five projects. At head `57bf7ae` the command `pnpm exec nx show projects --affected --json --files packages/config/src/vitest/unit.ts` returns exactly those five.

### Why the brief's command form was replaced

The brief's test called `nx show projects --affected` with no `--base` or `--files` flag. On this branch that form is vacuous. The default affected base is `main`. This branch was 13 commits over that base at the time of the original measurement and its commits touch every project, so Nx reports all five projects as affected on a clean tree. The assertion passes even without the dependency edge under test.

This was proved by experiment. With `@genie/config` removed from the `@genie/generators` devDependencies and a probe comment appended to the preset, the unflagged command still listed `@genie/generators`, because the edit to its own `package.json` makes it affected. The unflagged form cannot fail for the reason the test exists to catch.

The test as committed uses `--files packages/config/src/vitest/unit.ts`, which ignores the git working tree and branch history. The answer then depends on the project graph alone.

### RED and GREEN

RED was proved with `@genie/config` removed from `@genie/generators` `devDependencies`, against the `--files` form.

1. `pnpm exec nx show projects --affected --json --files packages/config/src/vitest/unit.ts` with the edge present listed `@genie/config`, `@genie/generators`, `@genie/core`, `@genie/app`, `@genie/ui`. The assertion held.
2. The same command with the edge removed listed `@genie/config`, `@genie/core`, `@genie/app`, `@genie/ui`. `@genie/generators` was absent. The assertion fails in that state.
3. Through vitest, the same RED appears as a module resolution failure, because the same `devDependencies` entry serves both the Nx graph edge and the `@genie/config/vitest/unit` import in `vitest.config.ts`. Removing the entry breaks both. A RED that fails only the graph assertion while the suite still runs is not reachable, because one entry carries both roles.

GREEN was proved with the edge restored. `pnpm --filter @genie/generators exec vitest run src/workspace/affected.test.ts` passes, 1 test. The full generators suite passes, 46 tests in 7 files. The entry was never actually removed in the committed state. No `implicitDependencies` entry was added. The edge comes from the real dependency that Task 8 introduced.

## Oxlint pin and the vendored anti-slop rules

| Item | Value |
| --- | --- |
| oxlint pin | 1.83.0, root and every package, exact |
| @oxlint/plugins pin | 1.83.0, exact |
| Compatibility | Both pins work together. The anti-slop plugin loads through `eslintCompatPlugin` from `@oxlint/plugins` and its rules fire, as the anti-slop fixtures and this task's own lint failures show |
| Vendored upstream | `https://github.com/dmmulroy/anti-slop` |
| Vendored revision | `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`, dated 2026-09-10 |
| Licence | MIT, full text in `packages/config/oxlint/anti-slop/LICENSE` |
| Rules enabled at error | 18 |

The 18 rule names are in `packages/config/src/oxlint/index.ts`, from `no-array-filter-map` to `require-safety-comment-for-type-assertion`. No `anti-slop-effect/` rule is enabled. The provenance exception table holds no exception. During the original task the anti-slop rules fired three times against new test files, and all three were fixed in the files. During the final fix pass, `oxfmt` reformatted `boundaries.test.ts` after its rewrite, and the full gate suite re-ran clean afterwards. No rule was weakened and no exception was added.

## Changed paths

Everything on this branch, base `7d68e91` to head `57bf7ae`, breaks into three spans. Tasks 1 to 8 produced `0544385` through `73ed55a`. Task 9 added `c990a59` with the affected graph, hygiene and cache proof, and `f9429f1` corrected this document's commit count. `a5063b7` applied the owner's formatter preferences and reformatted the tree, and `b3c8e22` fixed two comments. The final fix pass is `57bf7ae`, which changes `nx.json`, `packages/config/src/oxlint/boundaries.ts`, `packages/config/src/oxlint/boundaries.test.ts`, and `packages/config/src/vitest/unit.test.ts`, and adds no other file. This document is the only file after that.

## Not proved by this ticket

- The `build` target. No project has one. `pnpm build` runs zero tasks and exits 0.
- Automatic hook installation. The hook does not install on `pnpm install`. The `prepare` script was removed so the install cannot fail against this machine's `core.hooksPath`, which points at another checkout's Beads hooks. A human must resolve that conflict and opt in with `pnpm hooks:install`. See the staged hooks section.
- Tailwind preset consumption. `packages/config/src/tailwind/preset.ts` is verified by a scratch probe only. Nothing committed proves Tailwind consumes it, and no consumer exists yet, because no project carries styles. S0-02 or the first styled ticket owns the proof.
- Storybook and component tests. No Storybook configuration or story exists. S0-02 owns the compatibility proof.
- The module registry runtime. S0-05 owns it.
- The tenant context. S0-04 owns it.
- The migrator. S0-04 owns it.
- Integration tests against a real Postgres. No such test or container exists yet.
- End-to-end tests at any viewport. No Playwright harness exists yet.
- The Docker image and customer image builds. S0-11 owns them.
- Remote cache. Excluded from Spec 0 by the ticket scope. It stays off, and this ticket proves the off state rather than a remote setup.
- The generators as executed through `nx g`. This ticket proves the selection resolver's unit behavior and the graph it lives in, not a generator invocation that writes a new package.
- The boundary table spelling in the specification. `docs/specs/00-monorepo-foundation.md` still writes `@genie/modules/*`, which is not a realizable package name. The implementation covers the real hyphen spelling beside it. Correcting the specification is filed separately and is out of scope here.

Passing lint and unit tests on five skeletons is not deployment proof. It proves the workspace graph, the boundaries and the cache behave as designed at this stage. Sections 1 to 5 runtime behavior belongs to S0-02 and later.
