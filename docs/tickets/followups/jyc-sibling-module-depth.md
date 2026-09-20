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

The new plugin is `packages/config/oxlint/boundaries/`, with one rule, `boundaries/no-relative-package-escape`. For a file inside `packages/modules/<id>/`, it resolves every relative specifier and reports it when the result lands inside another module folder. The specifier is taken from an import, an export-from, an export-all, a dynamic import with a literal argument, and a `require` call with a literal argument. R-7a applies to executable source, and the module format of a file does not change what the call does.

A `require` that resolves to a local binding is left alone: a function of that name is not a loader. The check walks the scopes upward from the identifier, because a loader `require` resolves to no binding at all, in a module file as well as a script.

It bans nothing else. R-7's module row names the banned targets: another module package, `apps/*` and `customers/*`. Core and ui are not on that list, and `MODULE_LAYER` does not ban them, so a relative climb into core is not this rule's business. The other two banned targets carry their folder name in the specifier, so the existing globs catch them in every spelling. A rule about the spelling of a permitted import would need a requirement that does not exist today.

The module root is the outermost `packages/modules/<id>` segment of the file path. A module may hold a folder of its own named like the workspace layout, and taking the innermost segment would call an ordinary internal import a sibling import.

No import is executed. The rule reads syntax and file paths only. A computed specifier is left alone, whether it reaches `import()` or `require`, because it cannot be judged without running the program.

The deleted code is `MODULE_FOLDER_DEPTHS`, `moduleFilesAtDepth`, `siblingModulesAtDepth` and the four depth overrides. Everything else in `boundaries.ts` is untouched: the package-name bans, the path globs, the core allowance for a module, and every other layer.

## What this means for ft5

`genie-ops-center-v2-ft5` reports that `siblingModulesAtDepth` used `["<climb>*", "<climb>*/**"]`, and `*` also matches `..`, so a climb that left the package entirely was reported as a sibling-module import: the wrong diagnosis. That glob is the code this change deletes, so the wrong diagnosis goes with it.

The correction is not the one ft5 assumed. ft5 reads "being banned is not the problem, only the message is". R-7 does not ban a module's relative climb into core, so the current behavior is no diagnostic at all, and a test pins that: the climb into core is not reported as a sibling-module import and produces no boundary diagnostic. A rule that bans the spelling would be new policy and needs an owner.

So `ft5` stays open. This change removes its defective glob, and the parent and the reviewer decide whether the semantics above are the correction ft5 wanted or whether ft5 now asks for a spelling policy. Nothing beyond the shared mechanism was touched.

## Tests

Thirteen cases added to `packages/config/src/oxlint/boundaries.test.ts`, all through the real Oxlint binary:

1. a sibling module reached from a folder four deep is rejected;
2. the same from a folder seven deep, so the ceiling is gone rather than raised;
3. a sibling reached by a named re-export is rejected;
4. a sibling reached by a star re-export is rejected;
5. a sibling reached by a dynamic import is rejected;
6. a sibling reached by a literal `require` is rejected;
7. a local function named `require` is left alone;
8. a computed template specifier is left unjudged;
9. a climb into core is not called a sibling import and is not rejected;
10. a legal relative import inside the module from a folder four deep stays allowed;
11. a legal climb to the module's own root stays allowed;
12. an internal import from inside a folder named `packages/modules/beta` inside alpha stays allowed;
13. a real sibling import from inside that same folder is still rejected.

Measured, each mutation applied to the working tree and reverted:

| State | Result |
| --- | --- |
| The first three negative cases, before the rule existed | 3 failed, 112 passed |
| The whole suite as it stands | 200 passed |
| `boundaries/no-relative-package-escape` turned off | 8 failed: the five older sibling cases, the module configuration file among them, plus the deep ones |
| The export handler passing a synthetic `{ source }` object | 1 failed: `TypeError: node.range must be present at report`, the crash the review reproduced |
| The rule reporting every escape, not only a sibling module | 1 failed: the climb into core |
| A greedy module-root match | 1 failed: the internal import inside the nested `packages/modules/beta` folder |
| The `require` handler removed | 1 failed: the literal `require` of a sibling |
| The local-binding check removed | 1 failed: the local function named `require` |

Each of the last three rows is one mutation and exactly one failing test, so each fix has its own proof.

The plugin uses the typed API throughout. There is no `as never` and no other cast: the reported node is the declaration or the import expression that oxlint visited.

## Gates

From the worktree root, each Nx run with `--skip-nx-cache`.

| Command | Exit | Result |
| --- | --- | --- |
| `nx run @genie/config:lint` | 0 | `Successfully ran target lint` |
| `nx run @genie/config:typecheck` | 0 | `Successfully ran target typecheck` |
| `nx run @genie/config:test` | 0 | 221 tests passed |
| `nx run-many -t lint` | 0 | every project, so the new rule reports nothing on the repository as it stands |
| `pnpm run format:check` | 0 | 120 files |
