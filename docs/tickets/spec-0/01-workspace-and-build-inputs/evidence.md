# S0-01 evidence record

This record states what was run, what it printed, and what it did not prove. Every result below comes from a command executed in this worktree during this task. A check that was not run is named in "Not proved by this ticket".

## Revisions

| Item | Value |
| --- | --- |
| Branch | `feature/s0-01-workspace-and-build-inputs` |
| Integrated base revision | `7d68e91` (`7d68e9161026fd65c0de83dcda15fd17da7d5e37`), `docs: index new folders in the tree readme`, merged from `develop` |
| Head during this task | `73ed55a` (`73ed55a755d7db40889361f8497a625be0ae4e98`), `build(config): add the tailwind preset and reserve the storybook extension point` |
| Commits on the branch over base | 13, measured as `git rev-list --count 7d68e91..73ed55a` between the base and the head named above. A commit landed after that head makes this number stale, so re-derive it before trusting it |

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
| typescript | 7.0.2 | `pnpm list` |
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

All commands ran in this worktree with `pnpm exec nx run-many` or the root `pnpm` script that calls it.

| Command | Projects with the target | Outcome | Real task count |
| --- | --- | --- | --- |
| `pnpm exec nx run-many -t test --skip-nx-cache` | 5 | Pass, exit 0 | 5 tasks ran, 5.1 seconds |
| `pnpm exec nx run-many -t test` (immediately after the cold run) | 5 | Pass, exit 0 | 5 tasks re-ran, 5.0 seconds, `Cache: 0/5 hit`. `--skip-nx-cache` also skips writing, so this run had nothing to read. It wrote the entries |
| `pnpm exec nx run-many -t test` (the run after that) | 5 | Pass, exit 0 | 5 of 5 tasks read from cache, 18 milliseconds |
| `pnpm test` | 5 | Pass, exit 0 | 5 tasks |
| `pnpm lint` | 5 | Pass, exit 0 | 5 tasks |
| `pnpm exec nx run-many -t typecheck` | 5 | Pass, exit 0 | 5 tasks |
| `pnpm build` | 0 | Exit 0, printed `No tasks were run` | 0 tasks |
| `pnpm run format:check` | not a task, one root command | Pass, exit 0 | 60 files checked |

Unit test counts by package, from per-package `vitest run` invocations: `@genie/config` 37, `@genie/generators` 46, `@genie/core` 1, `@genie/ui` 1, `@genie/app` 1. Total 86 unit tests, all passing, plus one test file each for core, ui and app that proves the entrypoint loads without a side effect.

### The build gate is unproven

`pnpm build` exited 0 and ran nothing. Nx printed `No tasks were run`. No project registers a `build` target at skeleton stage. Exit 0 with zero tasks is not a passing build. This ticket does not prove the build gate. A build target exists only from S0-05 onward.

## Negative cases that failed as intended

The import boundaries live in `packages/config/src/oxlint/boundaries.test.ts`. It holds 19 `it` cases. 14 are negative cases that assert the lint run failed, 4 are positive cases that assert it did not fail, and 1 proves the suite runs against the real repository root. All 19 pass.

Every negative case asserts on the rule name `no-restricted-imports` in the oxlint output, not on the exit code alone. A failure for the wrong reason fails the test.

The negative cases are: `ui` importing `core` by package name, by package subpath, and by relative spelling. A module importing another module. A module importing the application. The `pg` driver outside core. The `drizzle-orm/node-postgres` binding outside core. `config` importing any internal project. `generators` importing a module implementation, the core runtime entrypoint, and a database driver. A module importing a core service subpath. Contracts importing anything but `zod`. The rules applying to a test file as well as source.

The positive cases are: `core` importing `ui`, `core` importing `pg`, `generators` importing the build-safe `@genie/core/tenant-config` subpath, contracts importing `zod`.

The anti-slop suite `packages/config/src/oxlint/anti-slop.test.ts` holds 6 cases. It proves an adjacent filter and map pair is rejected, a chained type assertion is rejected, module mocking is rejected, ordinary code passes, no `anti-slop-effect/` rule name is enabled, and the Effect plugin entry point is not registered. All 6 pass.

## Local cache proof

Sequence, each command run for real in this worktree, in this order.

1. `pnpm exec nx reset`. Exit 0. The daemon and the local cache were cleared.
2. `pnpm exec nx run-many -t test --skip-nx-cache`. Exit 0. 5 of 5 tasks ran for real. Run duration 5.1 seconds. The output said `Cache: Skipped (--skip-nx-cache)`.
3. `pnpm exec nx run-many -t test` immediately after. This run did not read the cache, because `--skip-nx-cache` also skips writing cache entries. It re-ran all 5 tasks in 5.0 seconds, `Cache: 0/5 hit`. This run wrote the entries.
4. `pnpm exec nx run-many -t test` again. Exit 0. The output said `Nx read the output from the cache instead of running the command for 5 out of 5 tasks.` Run duration 18 milliseconds. `Cache: 5/5 hit (100%)`. Nothing re-ran.

Conclusion: identical inputs replay 5 tasks from the local cache in 18 milliseconds instead of 5 seconds of real execution.

### A changed input busts the cache

1. A comment line was appended to `packages/config/src/vitest/unit.ts`.
2. `pnpm exec nx run-many -t test`. Exit 0. All 5 tasks re-ran, `Cache: 0/5 hit (0%)`.

The brief predicted that `@genie/config` and `@genie/generators` re-run. All 5 re-ran. The prediction was wrong in a harmless direction: `@genie/core`, `@genie/ui` and `@genie/app` are also downstream of `@genie/config` through the `^production` named input in `nx.json`, so a change to the shared preset correctly invalidates them too. All five projects consume the preset.

3. The comment was removed with `git checkout -- packages/config/src/vitest/unit.ts`.
4. One warm run to repopulate the entries, then `pnpm exec nx run-many -t test`. Exit 0. `Cache: 5/5 hit (100%)`. The working tree ended clean.

### No remote cache is in use

1. `nx.json` sets `"neverConnectToCloud": true`. `grep -iE "nxCloudAccessToken|nxCloudId" nx.json` finds nothing. No cloud key of any kind is present beyond `neverConnectToCloud`.
2. The environment holds no `NX_CLOUD` or `NX_APP_TOKEN` variable.
3. `pnpm exec nx run-many -t test --verbose` exited 0. A case-insensitive scan of its full output for `remote`, `cloud`, `nx.app` and `token` found zero lines. The only cache the output names is the local one, through `existing outputs match the cache, left as is`.

## Affected graph test

`tools/generators/src/workspace/affected.test.ts` asks Nx which projects a change to `packages/config/src/vitest/unit.ts` marks affected, and asserts the answer contains all five projects.

### Why the brief's command form was replaced

The brief's test called `nx show projects --affected` with no `--base` or `--files` flag. On this branch that form is vacuous. The default affected base is `main`. This branch was 13 commits over that base at the time of measurement (`git rev-list --count 7d68e91..73ed55a` printed 13) and its commits touch every project, so Nx reports all five projects as affected on a clean tree. The assertion passes even without the dependency edge under test.

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

The 18 rule names are in `packages/config/src/oxlint/index.ts`, from `no-array-filter-map` to `require-safety-comment-for-type-assertion`. No `anti-slop-effect/` rule is enabled. The provenance exception table holds no exception. During this task the anti-slop rules fired three times against this task's own new test file: once for a missing `SAFETY:` comment on a type assertion and twice for a missing blank line. All three were fixed in the test file. No rule was weakened and no exception was added.

## Changed paths

Everything on this branch, base `7d68e91` to head `73ed55a`, was produced by Tasks 1 to 8. Task 9 adds `tools/generators/src/workspace/affected.test.ts` and `docs/tickets/spec-0/01-workspace-and-build-inputs/evidence.md`, and changes nothing else.

## Not proved by this ticket

- The `build` target. No project has one. `pnpm build` runs zero tasks and exits 0.
- Storybook and component tests. No Storybook configuration or story exists. S0-02 owns the compatibility proof.
- The module registry runtime. S0-05 owns it.
- The tenant context. S0-04 owns it.
- The migrator. S0-04 owns it.
- Integration tests against a real Postgres. No such test or container exists yet.
- End-to-end tests at any viewport. No Playwright harness exists yet.
- The Docker image and customer image builds. S0-11 owns them.
- Remote cache. Excluded from Spec 0 by the ticket scope. It stays off, and this ticket proves the off state rather than a remote setup.
- The generators as executed through `nx g`. This ticket proves the selection resolver's unit behavior and the graph it lives in, not a generator invocation that writes a new package.

Passing lint and unit tests on five skeletons is not deployment proof. It proves the workspace graph, the boundaries and the cache behave as designed at this stage. Sections 1 to 5 runtime behavior belongs to S0-02 and later.
