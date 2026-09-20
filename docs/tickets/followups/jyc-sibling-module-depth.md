# jyc: the sibling-module ban loses its depth ceiling

Bead: `genie-ops-center-v2-jyc`. Branch `fix/jyc-deep-module-boundaries`, base `d20bc26`. Run date 2026-09-21.

## The defect

`MODULE_FOLDER_DEPTHS = [0, 1, 2, 3]` produced one override per folder depth, each banning the exact climb that leaves a module at that depth. A file deeper than three folders below its module root matched no depth entry, so its sibling import produced no diagnostic. `CLAUDE.md` prescribes `src/lib/<name>/`, so `packages/modules/alpha/src/lib/widgets/components/x.ts` is an ordinary path and sits at depth four.

Raising the ceiling would repeat the defect at the next depth. The ceiling is gone instead.

## Why a glob cannot do it

Oxlint matches the raw specifier string and never a resolved path. The same string means different things at different depths: from `alpha/src/nested/x.ts`, `../../utils/x.ts` lands inside alpha and is legal, while from `alpha/src/x.ts` a climb of that shape leaves the module. A depth-free glob therefore cannot separate a legal import inside a module from a sibling import.

`import/no-relative-packages` would express this, and the bead asked whether a later Oxlint carries it. The installed Oxlint 1.83.0 does not. Measured, not assumed:

```
$ oxlint --import-plugin -c .oxlintrc.json packages
Failed to parse oxlint configuration file.
  x Rule 'no-relative-packages' not found in plugin 'import'
```

No dependency was added and none was upgraded.

## The mechanism

`@oxlint/plugins` 1.83.0 is already a dependency: the vendored anti-slop plugin uses it, and the shared configuration already loads a plugin through `jsPlugins`. A plugin rule receives `context.filename`, so it can resolve a specifier against the importing file, which is what the glob cannot do.

The new plugin is `packages/config/oxlint/boundaries/`, with one rule, `boundaries/no-relative-package-escape`. For a file inside `packages/modules/<id>/`, it resolves every relative import, export-from and export-all specifier, and reports it when the result lands outside that module folder. The message follows the target: `a module never imports another module.` when the target is another module folder, and `a module reaches another package by its package name, never by a relative path.` for anything else.

No import is executed. The rule reads syntax and file paths only.

The deleted code is `MODULE_FOLDER_DEPTHS`, `moduleFilesAtDepth`, `siblingModulesAtDepth` and the four depth overrides. Everything else in `boundaries.ts` is untouched: the package-name bans, the path globs, the core allowance for a module, and every other layer.

## This also settles ft5

`genie-ops-center-v2-ft5` reports that `siblingModulesAtDepth` used `["<climb>*", "<climb>*/**"]`, and `*` also matches `..`, so a climb that left the package entirely was reported as a sibling-module import: the wrong diagnosis. That glob is the code this change deletes, so the wrong diagnosis goes with it. The two beads share one mechanism, and neither can be fixed while the other's defect stays.

A test now pins the right diagnosis: a relative climb into core from a module reports the package-name remedy and not the sibling message. `ft5` is unclaimed, so the parent owns the bookkeeping. Nothing beyond that one shared mechanism was touched.

## Tests

Five cases added to `packages/config/src/oxlint/boundaries.test.ts`, all through the real Oxlint binary:

1. a sibling module reached from a folder four deep is rejected;
2. the same from a folder seven deep, so the ceiling is gone rather than raised;
3. a climb into core reports the package-name remedy and not the sibling message;
4. a legal relative import inside the module from a folder four deep stays allowed;
5. a legal climb to the module's own root stays allowed.

Measured:

| State | Result |
| --- | --- |
| The three new negative cases, before the rule | 3 failed, 112 passed |
| After the rule, with the depth entries deleted | 115 passed |
| `boundaries/no-relative-package-escape` turned off | 8 failed: the five older sibling cases, the module configuration file among them, plus the three new ones |

The third row is the one that matters. The rule carries every sibling case the depth entries used to carry, and the tests fail if it goes away.

## Gates

From the worktree root, each Nx run with `--skip-nx-cache`.

| Command | Exit | Result |
| --- | --- | --- |
| `nx run @genie/config:lint` | 0 | `Successfully ran target lint` |
| `nx run @genie/config:typecheck` | 0 | `Successfully ran target typecheck` |
| `nx run @genie/config:test` | 0 | 211 tests passed |
| `nx run-many -t lint` | 0 | every project, so the new rule reports nothing on the repository as it stands |
| `pnpm run format:check` | 0 | 120 files |
