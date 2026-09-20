# Root config lint scope

Status: delivered on branch `fix/y5e-root-config-lint` from `develop` `7187c1f`, 2026-09-21. Bead `genie-ops-center-v2-y5e` (`s0-01-followup`).

## What was wrong

Every package's `lint` script targeted its own `src`, so the root configuration files were covered by no Nx lint target:

- `oxlint.config.ts` is loaded by every oxlint run, so its syntax is validated, but it was never linted as a file, so a rule violation in it went unreported;
- `oxfmt.config.ts` is read only by `oxfmt`, which is not an Nx target, so nothing that runs checked it at all;
- `tsconfig.base.json` is JSONC, which oxlint does not lint.

## The fix

`packages/config/package.json`'s `lint` script now runs from the workspace root and names the two root TypeScript config files as lint targets:

```json
"lint": "cd ../.. && oxlint --config=oxlint.config.ts packages/config/src oxlint.config.ts oxfmt.config.ts"
```

- `cd ../..` because oxlint rejects `..` in a positional path (`PATH must not contain ".."`), so the root files cannot be named from the package directory. The config package's own coverage is unchanged: `packages/config/src`.
- `--config=` rather than `--config ` keeps the config path a single token, so a test can tell the config file apart from a file that is linted.
- `tsconfig.base.json` stays out: oxlint does not lint JSON, and mislabelling the compiler's parse of it as an oxlint lint would be wrong. Its distinct validation is `nx typecheck`, which reads it through `extends`.

## Evidence

`NX_DAEMON=false`, cold then warm.

| Action | Result |
| --- | --- |
| baseline | real `0/1 hit`, warm `1/1 hit` |
| append to `oxfmt.config.ts` | `0/1 hit`; restored → `1/1 hit` |
| append to `oxlint.config.ts` | `0/1 hit`; restored → `1/1 hit` |
| syntax error in `oxfmt.config.ts` | config lint fails: `oxfmt.config.ts:6:7: error: Unexpected token` |
| `debugger;` in `oxfmt.config.ts` | config lint fails: `eslint(no-debugger)` and `anti-slop(require-readable-spacing)` |
| `debugger;` in `oxlint.config.ts` | config lint fails: the same two diagnostics |
| syntax error in `tsconfig.base.json` | `nx typecheck` fails: `EndOfFileExpected in .../tsconfig.base.json at 17:1` |

The two root files are hashed already through `sharedGlobals`, so an edit re-runs the task rather than replaying it; the measurements above confirm the miss-then-hit shape.

## Mutation evidence

Two mutations, each from the committed script:

1. Dropping the two positional files (`... packages/config/src`) fails the guard with `expected [ 'packages/config/src', …(1) ] to include 'oxlint.config.ts'`, and lets a broken `oxfmt.config.ts` pass: `NX Successfully ran target lint for project @genie/config`.
2. The space form `--config oxlint.config.ts packages/config/src oxfmt.config.ts`, where the root `oxlint.config.ts` is only the option value, fails the guard with `expected [ 'packages/config/src', …(1) ] to include 'oxlint.config.ts'`. A token-substring guard would have accepted this, because the token `oxlint.config.ts` is present either way.

`packages/config/package.json` was restored byte-identical after each (`sha256 7070c1b5e437c37aa21f8b5812593dbaaa2ce0d5f4f0b475823e3749ee29247d`).

The guard is `tools/generators/src/workspace/validate/lint-scope.test.ts`. It runs the lint script in a disposable tree against a stub `oxlint` that records the argv it was handed, consumes each option's value, and requires `oxlint.config.ts` and `oxfmt.config.ts` among the positional paths. Observing the argv is what separates a linted path from an option value.

## Not addressed here

The same bead comment also asks who owns the repository-wide lint scope over `docs/design/reference/**`, which `oxlint --all-files` would report. That is a scope decision on the shared oxlint config's ignore list, which is under concurrent edit, and no target runs `--all-files`; it is left out rather than folded into this change.

## Preserved

The config package's `src` lint coverage, its pins, and every other package's lint script are unchanged.
