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

The fix narrows without `typeof`, in one place: `report` now takes the literal value and uses

```ts
function isStringValue(value: LiteralValue): value is string {
  return String(value) === value;
}
```

A number, boolean, `null`, bigint or RegExp is never equal to its own `String()` coercion, so the predicate is exact. Both call sites pass the literal value and the check moved into `report`. Behaviour is unchanged; the boundary suite passes.

## Evidence

`NX_DAEMON=false`, cold then warm.

| Check | Result |
| --- | --- |
| `tsc --listFilesOnly` (after the fix) | lists `oxlint/boundaries/index.ts` and `oxlint/boundaries/rules/no-relative-package-escape.ts` |
| injected `debugger;` in the plugin | `nx lint @genie/config` fails: `...:148:1: error eslint(no-debugger)` |
| injected `const broken: number = "x";` | `nx typecheck @genie/config` fails: `...:148:7: error TS2322: Type 'string' is not assignable to type 'number'` |
| plugin edit | lint `0/1 hit`, typecheck `0/1 hit` |
| restored | lint `1/1 hit`, typecheck `1/1 hit` |

The plugin file was restored byte-identical after each injection (`sha256 6f7bec44fb25e7b3d912395cf26f13be7706b7a449b83ec93e5663e874ae41a9`).

## Guards

- `tools/generators/src/workspace/validate/lint-scope.test.ts` (extended) observes the lint script's argv and requires `packages/config/oxlint/boundaries` among the positional paths. Dropping it fails: `expected [ 'packages/config/src', …(2) ] to include 'packages/config/oxlint/boundaries'`.
- `packages/config/src/oxlint/plugin-coverage.test.ts` (new) runs `tsc --listFilesOnly` and requires both plugin files in the program. Dropping `oxlint/boundaries/**/*.ts` from the include fails the assertion.

`packages/config/package.json` and `packages/config/tsconfig.json` were restored byte-identical after the guard mutations.

## Preserved

The y5e rooted lint command and root-config positionals, the vendored anti-slop scope, and every existing pin are unchanged.
