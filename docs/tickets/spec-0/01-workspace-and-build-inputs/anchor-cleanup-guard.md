# Anchor cleanup guard

Status: delivered on branch `test/1rd-1-3-anchor-cleanup` from `develop` `4a7b7c5`, 2026-09-21. Bead `genie-ops-center-v2-1rd.1.3` (standalone s0-01 follow-up). Test-only.

## What is guarded

`lintAtIsolated` in `packages/config/src/oxlint/__testing__/lint-at.ts` creates a throwaway root and symlinks three anchors into the checkout. Its `finally` removes each anchor before removing the root:

```ts
rmSync(join(root, anchor), { force: true, recursive: true });
```

`recursive: true` was added so an anchor name that became a real directory cannot throw `ERR_FS_EISDIR` inside the `finally`, hide a live error and leak the root. Reverting the option failed no test — measured as 0 failures at re-review `5327afb` — and the per-anchor check was recorded as untestable without widening the helper's public surface. `genie-ops-center-v2-1rd.1.3` records that gap. Its acceptance is a test that fails when `recursive` is removed, or removal of the option.

## The guard

`lint-at.test.ts` gains a case that puts a disposable `pnpm` on `PATH` for one `lintAtIsolated` call. `runOxlint` shells out to `pnpm`, so the stub runs with the isolated root as its working directory and:

1. records the root, that the anchor was a symlink, and the link target;
2. unlinks the anchor symlink by name (`unlinkSync` removes the link, never the checkout it points at);
3. creates a real directory at that anchor name holding its own file;
4. exits 0.

The helper's `finally` must then remove that real directory recursively and the root with it, while the checkout anchor the link pointed at still stands. The test asserts all of that, so it can pass only if the recursive per-anchor removal ran.

The stub is a real process recorded on disk, not a `vi.mock`: the helper is observed through the same `execFileSync` boundary the product uses. The case keeps its own `finally`, which restores `PATH`, deletes the stub's variables, and removes the isolated root the helper leaked when the mutation probe throws — a mutation run leaves no temporary root behind.

## RED and GREEN

Run in this worktree, `lint-at.ts` mutated and restored:

1. `sha256sum packages/config/src/oxlint/__testing__/lint-at.ts`: `a8f0e813bf325fa70f3674d5827c5b89fbbc5321f92da9c572153def012dd148`.
2. The per-anchor call changed to `rmSync(join(root, anchor), { force: true })`.
3. `pnpm --filter @genie/config exec vitest run src/oxlint/__testing__/lint-at.test.ts` failed: `SystemError: Path is a directory: rm returned EISDIR (is a directory) /tmp/oxlint-boundary-…/node_modules`.
4. The file was restored; `sha256sum` matched byte for byte, `git status` was clean, and no stray `oxlint-boundary-*` root remained.
5. The suite passed: 24 tests.

`@genie/config` gates `lint typecheck test` passed uncached (187 tests); `format:check` passed on 86 files.

## Scope

Test-only. No change to `lint-at.ts` or any production surface. The parallel bead `genie-ops-center-v2-1rd.1.1` adds a different case to the same test file; this change appends a new `describe` block and does not restructure the existing cases.
