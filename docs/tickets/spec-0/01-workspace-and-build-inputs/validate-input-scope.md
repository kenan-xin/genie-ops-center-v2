# Validate input scope

Status: delivered on branch `fix/19f-validate-cache-scope` from `develop` `4923dc9`, 2026-09-21. Bead `genie-ops-center-v2-19f` (`s0-01-followup`).

## What was wrong

The `validate` target declared `{workspaceRoot}/**/vitest*.config.*`, so any project's vitest config edit invalidated the cached validate result. `validate` runs `vitest run --config tools/generators/vitest.validate.config.ts`, whose only import is `vitest/config`. The four checks read:

- `affected.test.ts` — the Nx project graph, through `nx show projects --affected --files packages/config/src/vitest/unit.ts`;
- `hygiene.test.ts` — the project graph, `classifyProject`/`moduleProjectNamingError` (generator sources), and each project root's `README.md`;
- `generator-entrypoint-resolution.test.ts` — `tools/generators/package.json`, its exports target, and Node resolution from the Storybook host;
- `validate-inputs.test.ts` — `nx.json`.

None reads a `vitest*.config.*` file, so the old finding holds. The shared preset `packages/config/src/vitest/unit.ts` is used by `affected.test.ts` only as a `--files` path for the graph probe: the edge it exercises is declared in `package.json`, which is already an input, so the preset's content is not read. The generator's own configs stay inputs through `{projectRoot}/**/*`.

The same over-selection existed for READMEs: `packages/*/README.md` also matched `packages/modules/README.md`, which is not a project root and is read by no check.

## The fix

```diff
- "{workspaceRoot}/**/vitest*.config.*",
+ "!{workspaceRoot}/packages/modules/README.md",
```

`{workspaceRoot}/packages/*/README.md` and `{workspaceRoot}/packages/modules/*/README.md` are unchanged.

## Evidence

`NX_DAEMON=false`, cold then warm. Every edit is a comment appended to the named file and then reverted; identical trees hit `1/1` in both states.

| Edit | Before | After |
| --- | --- | --- |
| unrelated `apps/storybook/vitest.config.ts` | `0/1 hit` | `1/1 hit` |
| unrelated `packages/core/vitest.config.ts` | `0/1 hit` | `1/1 hit` |
| unrelated `packages/modules/placeholder/vitest.config.ts` | — | `1/1 hit` |
| own `tools/generators/vitest.validate.config.ts` | `0/1 hit` | `0/1 hit` |
| own `tools/generators/src/workspace/validate/hygiene.test.ts` | — | `0/1 hit` |
| `packages/modules/README.md` (not a project root) | `0/1 hit` | `1/1 hit` |
| project READMEs (`packages/core`, `packages/modules/placeholder`, `apps/storybook`, `tools/generators`) | `0/1 hit` | `0/1 hit` |

## Mutation evidence

Restoring `{workspaceRoot}/**/vitest*.config.*` and dropping the README negation fails both new assertions in `validate-inputs.test.ts`:

- `declares no workspace-wide vitest config glob, which no check reads` → `expected [ Array(1) ] to deeply equal []`;
- `excludes the module container README, which is not a project root` → `expected [ '{projectRoot}/**/*', …(14) ] to include '!{workspaceRoot}/packages/modules/REA…'`.

`nx.json` was restored byte-identical (`sha256 8c5c2c318d1b34305c8f8ae92eef08312808d7836826d7f4b7a32f7cd4e79323`).

## Preserved

The 0d2 ignore inputs, every other input, and the project-root README contract are unchanged.
