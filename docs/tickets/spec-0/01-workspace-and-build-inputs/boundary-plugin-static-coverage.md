# Boundary plugin static coverage

Status: delivered on branch `fix/x7x-boundary-plugin-checks` from `develop` `b5edeb7`, 2026-09-21. Bead `genie-ops-center-v2-x7x` (bug).

## What was wrong

The repository-owned Oxlint plugin at `packages/config/oxlint/boundaries/**` is loaded through the `jsPlugins` specifier in `packages/config/src/oxlint/index.ts`, which is a string. Nothing else pulled it into a compiler program or a lint run:

- `packages/config/tsconfig.json` included only `src/**/*.ts` and `vitest.config.ts`, so `tsc --listFilesOnly` listed zero authored boundary plugin files;
- the config package's `lint` script covered only `packages/config/src` (plus the root configs added by y5e).

The runtime boundary tests execute the plugin, but a type or rule error in the plugin itself was reported by no Nx gate.

## The fix

- `packages/config/package.json` lint now names the plugin folder as a lint target, keeping the rooted command and the root-config positionals from y5e:

```json
"lint": "cd ../.. && oxlint --config=oxlint.config.ts packages/config/src packages/config/oxlint/boundaries oxlint.config.ts oxfmt.config.ts"
```

- `packages/config/tsconfig.json` include adds `"oxlint/boundaries/**/*.ts"`.

The vendored anti-slop plugin stays out of both: it remains in the shared config's `ignorePatterns`, and its files are not in the tsconfig include.

## Defect the lint revealed

With the plugin in scope, `nx lint @genie/config` reported two `anti-slop(no-runtime-typeof)` errors in `rules/no-relative-package-escape.ts`, on the `typeof value === "string"` checks that guard a literal specifier. The rule forbids runtime `typeof` outside an existence probe.

The rule documents a type-guard exception (`allowInTypeGuards`), because an AST literal is already parsed rather than untrusted I/O, but that option is off repository-wide. The fix keeps the ordinary type guard and carries a local suppression, changing no configuration:

```ts
function isStringValue(value: LiteralValue): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed AST literal, not untrusted I/O
  return typeof value === "string";
}
```

Both call sites pass the literal value and the narrowing stays in `report`. Behaviour is unchanged; the boundary suite passes.

## Evidence

`NX_DAEMON=false`, cold then warm.

| Check | Result |
| --- | --- |
| `tsc --listFilesOnly` (after the fix) | lists `oxlint/boundaries/index.ts` and `oxlint/boundaries/rules/no-relative-package-escape.ts` |
| injected `debugger;` in the plugin | `nx lint @genie/config` fails: `...:148:1: error eslint(no-debugger)` |
| injected `const broken: number = "x";` | `nx typecheck @genie/config` fails: `...:148:7: error TS2322: Type 'string' is not assignable to type 'number'` |
| plugin edit | lint `0/1 hit`, typecheck `0/1 hit` |
| restored | lint `1/1 hit`, typecheck `1/1 hit` |
| type guard without its suppression | `nx lint @genie/config` fails: `...:29:10: error anti-slop(no-runtime-typeof)` |
| type guard with its suppression | `nx lint @genie/config` passes |
| `require(42)`, `import(42)`, `import(true)` through real oxlint | left unjudged, no boundary diagnostic |
| narrowing mutated to accept every value | the non-string control fails: `expected true to be false` |

The plugin file was restored byte-identical after each injection (`sha256 53bbe7257396dda7b17f18de1dbfe079849d474972708ea567af0de15dd8852b`). The existing string rejections (`require("…")` and `import("…")` reaching a sibling module) still fail as before, so the control keeps both directions.

## Guards

- `tools/generators/src/workspace/validate/lint-scope.test.ts` (extended) observes the lint script's argv and requires `packages/config/oxlint/boundaries` among the positional paths. Dropping it fails: `expected [ 'packages/config/src', …(2) ] to include 'packages/config/oxlint/boundaries'`.
- `packages/config/src/oxlint/plugin-coverage.test.ts` (new) runs `tsc --listFilesOnly` and requires both plugin files in the program. Dropping `oxlint/boundaries/**/*.ts` from the include fails the assertion.
- `packages/config/src/oxlint/boundaries.test.ts` (extended) runs `require(42)`, `import(42)` and `import(true)` through the real oxlint binary and requires them left unjudged, beside the existing string rejections.

`packages/config/package.json` and `packages/config/tsconfig.json` were restored byte-identical after the guard mutations.

## Preserved

The y5e rooted lint command and root-config positionals, the vendored anti-slop scope, and every existing pin are unchanged.
