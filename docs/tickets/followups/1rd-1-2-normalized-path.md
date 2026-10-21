# 1rd.1.2: the normalized path reaches oxlint

Bead: `genie-ops-center-v2-1rd.1.2`. The acceptance criterion asks for a test that fails when either call site in `lintAtIsolated` reverts to the raw `relativePath`. One call site is now covered by a test. The other is an equivalent mutant, and this file states why, for a reviewer to adjudicate.

Run date 2026-09-21. Branch `test/1rd-1-2-normalized-path`, base `a7cf8a1`. Command: `pnpm exec vitest run packages/config/src/oxlint/__testing__/lint-at.test.ts`.

## The covered call site: `runOxlint(root, safePath)`

The new case is `the path lintAtIsolated hands to oxlint`. It lints a fixture at `a/../__normalized__-<pid>/__normalized__.ts` with a `debugger` statement in it.

Oxlint refuses any PATH argument that holds `..`, so the argument is observable through real behavior. No mock and no new export was needed.

| Source state | Result |
| --- | --- |
| As written, `runOxlint(root, safePath)` | 24 passed. The output holds the `no-debugger` diagnostic |
| Mutated to `runOxlint(root, relativePath)` | 1 failed, 23 passed. The output holds ``Error: `a/../__normalized__-<pid>/__normalized__.ts`: PATH must not contain ".."`` and no diagnostic |

The mutation was applied to the working tree, measured, and reverted. The source file is unchanged on this branch.

## The uncovered call site: `withFixture(root, safePath, ...)`

Mutating this one to `withFixture(root, relativePath, ...)` leaves all 24 tests passing, and no test can separate the two.

`withFixture` reads its `relativePath` parameter once, in `join(root, relativePath)`. `node:path.join` normalizes the path it returns, so `join(root, x)` and `join(root, normalize(x))` name the same file for every `x`. Everything else in `withFixture`, the escape guard, the created-directory list, the write and the cleanup, derives from that one value. A caller therefore cannot observe the difference, whatever it passes.

A check over 17 spellings, including `./x.ts`, `.//sub/x.ts`, `a/../sub/x.ts`, `../escape.ts`, `..foo/x.ts`, `sub//x.ts`, `sub/.`, `""` and `"."`, found no case where the two strings differ, and none where they differ after `resolve`.

This is an equivalent mutant. Killing it needs a test that reads the source rather than the behavior, which is brittle and was not added.

## Proposed narrowing of the acceptance criterion

For the reviewer to accept or reject: read the criterion as "a test fails when the `runOxlint` call site is reverted to the un-normalized path". Record the `withFixture` call site as an equivalent mutant, with the reason above. Keeping `normalize` before `withFixture` is still right, because it makes the guard on the first path segment read the landed path, but no behavior depends on which of the two values that call receives.

The bead stays open for that adjudication.
