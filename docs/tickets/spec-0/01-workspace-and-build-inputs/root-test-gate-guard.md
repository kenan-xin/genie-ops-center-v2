# Root test gate guard

Status: delivered on branch `test/3o6-root-test-gate` from `develop` `2667a18`, 2026-09-21. Bead `genie-ops-center-v2-3o6` (`s0-01-followup`).

## What is guarded

Commit `38c7a3e` ("fix(repo): run the validate target in the root test gate") changed the root `test` script from `nx run-many -t test` to `nx run-many -t test validate`. Its message records why:

> `pnpm test` only ran the `test` target, so the workspace validation that `tools/generators/vitest.config.ts` keeps out of the unit collection was reachable through `pnpm run affected` alone. A new package with no `README.md` or a wrong Nx tag then left `pnpm test` green.

The wiring had no guard: deleting `validate` from the root script again failed no test, and the whole-branch finding would silently reopen. `genie-ops-center-v2-3o6` records that gap.

## The guard

`tools/generators/src/workspace/root-test-gate.test.ts` runs the root `test` script, read from the root `package.json`, inside a disposable temporary directory. A stub `nx` executable on `PATH` appends its argv to a log file and exits 0, so the real workspace never runs and no test recurses into `nx run-many -t test`. The assertion reads the recorded argv and requires the `run-many` target list to carry both `test` and `validate`.

It deliberately does not compare the script to an exact string, and it does not execute `pnpm test`. A literal match breaks on a harmless rewrite, and a real run only shows that whatever the script currently says can pass.

The test lives in the unit collection: `tools/generators/vitest.config.ts` excludes only `src/workspace/validate/**`, and `vitest.validate.config.ts` includes only that directory. The placement is the point. If `validate` is deleted, the guard must still run under `nx test`; a guard inside the `validate` collection would be skipped by exactly the regression it exists to catch.

## RED and GREEN

Run in this worktree, the real root `package.json` mutated and restored:

1. `sha256sum package.json` before: `0fdb4687e8ae023e67ab3bdda26a7b7834b70bd6b5f83b896ddc9f74331433dd`.
2. `test` mutated from `nx run-many -t test validate` to `nx run-many -t test`.
3. `pnpm --filter @genie/generators exec vitest run src/workspace/root-test-gate.test.ts` failed: `AssertionError: expected [ 'test' ] to include 'validate'`.
4. The manifest was restored from a byte copy of the original. `sha256sum package.json` again: `0fdb4687e8ae023e67ab3bdda26a7b7834b70bd6b5f83b896ddc9f74331433dd`. `git status --porcelain` reports only the new test file, so the mutation left no trace.
5. The same vitest run passed: 1 test file, 1 test.

## Scope

This change adds no root `package.json`, `nx.json`, lockfile, or product change. The root script wiring, and any Nx cache input that would let the root manifest invalidate the guard, belong to the shared-file surface and are not touched here. The residuals recorded in the same bead, the narrowed README input still selecting non-root `README.md` files and the unit-collection caching boundary, are cache noise tracked separately.
