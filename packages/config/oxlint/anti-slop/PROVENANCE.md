# anti-slop provenance

Vendored source. Upstream distributes no npm package, so the rules are copied here on purpose.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/dmmulroy/anti-slop |
| Revision | `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` |
| Revision date | 2026-09-10 |
| Licence | MIT. The full text is in `LICENSE`. |
| Copied on | 2026-09-19 |
| Copied paths | `src/` from the upstream root, minus every `*.test.ts` file |

The vendored `src/vendor/eslint-stylistic/` subtree keeps its own licence
(`vendor/eslint-stylistic/LICENSE`) and its upstream note
(`vendor/eslint-stylistic/UPSTREAM.md`), copied unchanged.

## Local modifications

- Removed every `*.test.ts` file. The upstream tests need `tsx`, which this repository does not carry. The rules are proved by the fixtures in `packages/config/src/oxlint/anti-slop.test.ts`.

## Enabled rules

Every generic rule is on at `error`. The list is in `packages/config/src/oxlint/index.ts`.

## Rules that stay off

The five Effect rules stay off. This repository does not adopt Effect, and adoption needs separate approval (Spec 0 R-5a). The Effect entry point is not registered.

## Documented exceptions

| Rule | Path or case | Reason |
| --- | --- | --- |
| (none) | | No exception is needed yet. |

An exception must narrow to a legitimate boundary validation, a framework contract, or a test fixture. Never weaken a type or change behavior to satisfy a rule.

## Updating

An upstream update must keep the reviewed local policy. Stage incoming source separately and merge. Never replace this folder in one step.
