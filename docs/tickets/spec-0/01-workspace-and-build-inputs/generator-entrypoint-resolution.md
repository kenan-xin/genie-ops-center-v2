# Generator entrypoint resolution evidence

Bead `genie-ops-center-v2-vqi`, a follow-up to `genie-ops-center-v2-div` (`tools/generators` must export its selection barrel).

The original Task 6 negative control removed the `exports` key from `tools/generators/package.json` and observed `ERR_MODULE_NOT_FOUND`. That manifest carries no `main` field, so the failure only proves "no entrypoint at all". It cannot separate that from "the exports map decides resolution", because with neither field the legacy `main` fallback has nothing to find. This record replaces the weak control with a disposable fixture that carries both a valid legacy `main` and an `exports` map.

## Proof

`tools/generators/src/workspace/validate/generator-entrypoint-resolution.test.ts`, seven cases in the `validate` collection:

- The real manifest declares `exports["."]` as `./src/selection/index.ts` and that file exists.
- `@genie/generators` resolves by package specifier from the real consuming host, `apps/storybook/.storybook`, to `tools/generators/src/selection/index.ts`.
- A disposable package tree under the OS temp directory models the four resolution outcomes. Node's CommonJS resolver is used because its legacy `main` fallback is the one the original probe reached. Anchoring `createRequire` inside the fixture root keeps resolution to the fixture's own `node_modules`.

| Fixture | `exports` | `main` | Observed |
| --- | --- | --- | --- |
| `fixture-exports-wins` | `./exports-entry.cjs` (present) | `./legacy-main.cjs` (present) | Resolves and loads the exports target, `exports-map`. The legacy main file is a real, loadable alternative that was not chosen |
| `fixture-exports-broken` | `./absent-exports-entry.cjs` (absent) | `./legacy-main.cjs` (present) | Throws `Cannot find module .../absent-exports-entry.cjs`. The message names the exports target and not the valid main file, so no fallback occurred |
| `fixture-legacy-main-only` | absent | `./legacy-main.cjs` (present) | Resolves and loads the legacy main, `legacy-main`. The same main file the case above refused to fall back to is genuinely resolvable |
| `fixture-exports-only-broken` | `./absent-exports-entry.cjs` (absent) | absent | Throws the same `Cannot find module .../absent-exports-entry.cjs`. This is the original control's shape: with no main it is indistinguishable from the case that had one |

The third row is the control that makes the second row meaningful: the failure is attributable to the presence of the `exports` map, not to a broken `main`. The fixture is created with `mkdtemp` outside the repository and removed in `afterAll`; a case asserts it never lives inside the workspace.

## Red/green probe

Removing `exports` from `tools/generators/package.json` and re-running the file turned the two real-manifest cases red:

```
FAIL ... > declares its selection barrel in the real exports map
FAIL ... > reaches the barrel by package specifier from the real consuming host
Error: Cannot find module '@genie/generators'
  Require stack:
  - .../apps/storybook/.storybook/main.ts
Tests  2 failed | 5 passed (7)
```

The manifest was restored with `git checkout -- tools/generators/package.json` and verified byte-identical. This is the weak signal the bead described: reverting `exports` alone yields only "no entrypoint", which is why the fixture proof is needed.

## Commands

Run in this worktree after `pnpm install --frozen-lockfile --ignore-scripts`:

| Command | Outcome |
| --- | --- |
| `pnpm exec vitest run --config vitest.validate.config.ts src/workspace/validate/generator-entrypoint-resolution.test.ts` (from `tools/generators`) | 7 passed |
| `pnpm exec nx run-many -t lint typecheck test validate --projects=@genie/generators --skip-nx-cache --output-style=static` | All four targets passed. Unit 51, validate 26 |
| `pnpm run format:check` | All 86 matched files correctly formatted |

## Limitations

- The proof models Node's package resolution against a disposable fixture. The real package is not given a `main` field, because that would change product behavior; the fixture is the only way to place `main` and `exports` side by side.
- Resolving `@genie/generators` from `apps/storybook/.storybook` proves the specifier resolves; it does not prove a Storybook build loads the barrel at build time. Consumer proof belongs to S0-02 and S0-05.
- No manifest, pin, lockfile, Nx configuration or product behavior changed. No hook activation, push or closure was performed.
