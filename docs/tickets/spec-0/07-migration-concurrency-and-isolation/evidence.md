# S0-07 evidence

Bead: `genie-ops-center-v2-1rd.7`. Branch `kenan-xin/feature-s07-stage-appropriate-module-generator`.
Baseline: branch merged local `develop` at merge `92c8f8c` (develop `4a9fd37`), then again at `7172698` (develop `ecd419f`). Code fixes at `dd49e5a` and `ece3333` (guard added at `3dc5618`).
Recorded 2026-09-22. Every result below was observed on this host in this session; anything not proved is named under [Not proved](#not-proved).

Gate: G3 database evidence. This ticket owns core migrator hardening, database test fixtures, and app isolation assertions/reporting. The app/image/CI wiring remains S0-11.

## What this ticket added

The migrator concurrency/recovery matrix and the tenant-context containment proof were already present; this ticket added the **core required-execution guard** so an all-skipped or miscollected core integration run cannot return green. Everything else below is the acceptance matrix this ticket owns, verified rather than rewritten.

## Two-context router isolation (AC-4, R-20, R-39)

Not rewritten: `apps/genie/testing/isolation.integration.test.ts` already composes two Testcontainers Postgres, two `createTenantContext` pools in one process, and the placeholder router through each, using the module-owned factory `insertPlaceholderRecord` and the generic core helper `startDisposableDeployment`, with no core-to-module import. Authored by S0-05 (`483e2f3`) and integrated in accepted G2 (`3bafa24`).

Observed green at `15a5668`:

| Command | Result |
| --- | --- |
| `pnpm --filter @genie/app exec vitest run --config vitest.integration.config.ts testing/isolation.integration.test.ts` | exit 0, 2/2 |

Observed green through the full mandatory runner at `7172698`, exit 0, after clearing the host's stale Testcontainers:

| Command | Result |
| --- | --- |
| `nx run @genie/app:test:integration --skip-nx-cache` | exit 0, 10 files / 89 tests; isolation file 2/2 |

RED shared-database mutation: `beforeAll` made to build one deployment and assign both contexts to it. Both cases failed exactly as the test intends, then the mutation was reverted and the file re-passed:

```
AssertionError: expected [ 'first-only', 'second-only' ] to deeply equal [ 'first-only' ]
AssertionError: expected 'postgres://…' not to be 'postgres://…'
```

The no-skip guard is `apps/genie/testing/required-tests-guard.ts` plus `apps/genie/tools/run-required-tests.ts`, wired as `@genie/app:test:integration`. Observed RED against the merged tree:

| Command | Result |
| --- | --- |
| `node tools/run-required-tests.ts -t __s07_no_match__` (from `apps/genie`) | exit 1; both isolation cases named `mandatory case did not execute (status skipped). R-20 forbids skipping it.` |

## Core migrator matrix and containment (AC-6, AC-9, R-25a–R-28)

`packages/core/testing/migrator.integration.test.ts` (13 cases) and `packages/core/testing/tenant-context.integration.test.ts` (2 cases) are the matrix. The containment pair covers `wwc`, whose repair is `packages/core/src/lib/tenant-context/index.ts:56-60` (per-client `error` listener at checkout), verified at `15a5668`.

Observed green on the merged tree, all against real disposable Postgres:

| Command | Result |
| --- | --- |
| `nx run @genie/core:test:integration --skip-nx-cache` | exit 0, 3 files / 31 tests |

## Core required-execution guard (this ticket)

`packages/core/testing/required-tests-guard.ts` names the 15 acceptance cases per file; `packages/core/tools/run-required-tests.ts` reads vitest's JSON report back and fails unless every named case was collected, executed and passed. `packages/core/package.json` makes the runner the `test:integration` entry point; `packages/core/vitest.integration.config.ts` covers `testing/**/*.test.ts` so the runner's controls are collected. This mirrors the app harness guard and stays local to core so no core file imports an app (R-39).

Observed RED and GREEN on the merged tree:

| Command | Result |
| --- | --- |
| `nx run @genie/core:test:integration --skip-nx-cache -- -t __s07_no_match__` | exit 1; all 15 mandatory cases named `mandatory case did not execute (status skipped)` |
| `nx run @genie/core:test:integration --skip-nx-cache` | exit 0, 31/31 |
| `pnpm run test:integration` (from `packages/core`) | exit 0, 31/31, including 16 runner controls |

Before this change the same filter returned green: `vitest run --config vitest.integration.config.ts -t __s07_no_match__` exited 0 with 15 skipped.

Re-proved after the review fixes at `dd49e5a`: `node tools/run-required-tests.ts -t __s07_no_match__` exits 1 naming every case with its file's clauses, and `pnpm run test:integration` exits 0 with 31/31. Re-proved again at `ece3333`, the final tip: RED exits 1 naming all 15 cases, GREEN exits 0 with 31/31.

## Independent review

A fresh-context semantic review of `92c8f8c..1897168` returned **PASS-with-findings**: no false-green and no false-red path found. It confirmed the 15 manifest names match vitest's `fullName` exactly (15 checked, 0 mismatches), that absolute report paths resolve correctly under `node`, `nx run` and `pnpm --filter`, that the widened include is a safe superset, and that the runner nesting is bounded. Three confirmed defects were fixed at `dd49e5a`: a per-file skip reason (was hardcoded to the migrator matrix), a stderr assertion in the real-config negative control (was exit-code only), and a spawn `error` listener (was an opaque crash on a missing vitest binary). One out-of-scope gap was filed: module packages carry no required-execution guard on their own `test:integration` (`genie-ops-center-v2-atz`).

Re-confirmation after both merges: the same reviewer returned **CONFIRMED-with-caveats** at `7172698`. Neither merge touched any of the six S0-07-owned files (`git log --merges` is empty for each), the three fixes are correct with no regression, no new false-green or false-red path was introduced, the 15 manifest names still match the unchanged acceptance files, and develop's new `packages/core/src/lib/module-contract/validate.ts` is not in the guard's or the integration collection's import graph. Its two caveats were resolved: the then-uncommitted evidence (now this record) and a second, misleading spawn-failure diagnostic, fixed at `ece3333` by short-circuiting the manifest check on the spawn-error path.

## Gates on the merged baseline

All at `ece3333`, the final tip (develop `ecd419f`).

| Command | Result |
| --- | --- |
| `pnpm run test:integration` (from `packages/core`) | exit 0, 31/31 |
| `nx affected -t build test lint typecheck --base develop --skip-nx-cache` | exit 0, 16 tasks across 5 projects |
| `pnpm exec oxfmt --check --disable-nested-config .` | pass, 267 files |
| `npx supercov quality patch --base develop` | exit 0; advisories on the guard mirror the app harness (deep nesting, long method, boundary-driven duplication) |
| `nx run @genie/app:test:integration --skip-nx-cache` | exit 0, 10 files / 89 tests |

## Corrections and limits

- **`pnpm --filter @genie/core test:integration -- -t <filter>` inserts a literal `--`** before the forwarded args, which vitest treats as end-of-options and swallows the runner's reporter/output-file flags. The run still fails closed (`Failing closed.`), but the violation text is the wrong one. `pnpm run test:integration -t <filter>` and `nx run @genie/core:test:integration -- -t <filter>` forward cleanly and name the skipped cases. Left as the app harness behaves; not fixed to keep parity.
- **The containment proof is the `wwc` repair's own verification**, recorded on `wwc`. This ticket does not close `wwc`.
- **The full app mandatory runner is subject to the documented Testcontainers flake.** Earlier attempts at host load 13-19 exited 1 on the `testcontainers` 10s port-bind wait (`transport.integration.test.ts`, `viewer-background.integration.test.ts`) and once on `docker run -p 3412` "address already in use". The isolation file passed 2/2 in every attempt and the guard failed closed, so no S0-07 assertion was ever affected. After confirming no stale S0-07-owned containers and no listeners on ports 3400-3413, a clean retry at `7172698` passed the whole suite: exit 0, 10 files / 89 tests. No product or test code was changed to accommodate the host.

## Not proved

- The app/image/CI wiring of this matrix (installed-image acceptance, customer image matrix, all four CI layers) is S0-11's owned result and was not run here.
- The core guard's manifest is fixed to the current case names; a future rename must update it, by design.
- No integration into `develop`, no push, no Bead closure.
