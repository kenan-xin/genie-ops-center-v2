# S0-07 evidence

Bead: `genie-ops-center-v2-1rd.7`. Branch `kenan-xin/feature-s07-stage-appropriate-module-generator`.
Baseline: branch merged local `develop` at `92c8f8c` (develop `4a9fd37`), `7172698` (develop `ecd419f`), `b16fa10` (develop `cb35129`, S0-09 and the akh idle-pool repair), then `97592ef` (develop `2713701`, the c74 fix). Code fixes at `dd49e5a`, `ece3333`, and `3e980e1` (guard added at `3dc5618`).
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

At `b16fa10` the app runner was red on an S0-09 test-fixture defect, not on any S0-07 case: S0-09 added `testing/devtools-exclusion.test.ts` to the app manifest without adding the matching synthetic fixture in `apps/genie/testing/required-runner.test.ts`, so the runner's own healthy control failed. Filed `genie-ops-center-v2-c74`; the isolation file still passed 2/2. Develop fixed it at `2713701`/`c92c8a3` by deriving the app fixtures from the manifest, and the final merge `97592ef` brought that in. At `3e980e1` the app runner is fully green:

| Command | Result |
| --- | --- |
| `nx run @genie/app:test:integration --skip-nx-cache` | exit 0, 11 files / 98 tests; isolation file 2/2 |

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

`packages/core/testing/migrator.integration.test.ts` (13 cases) and `packages/core/testing/tenant-context.integration.test.ts` are the matrix. The containment cases cover `wwc`, whose repair is `packages/core/src/lib/tenant-context/index.ts:56-60` (per-client `error` listener at checkout), verified at `15a5668`. Develop's akh repair added a third tenant-context case (idle-client containment) at `b16fa10`; the manifest names the two `wwc` cases it was written for and leaves akh's case optional coverage, so S0-07 does not absorb akh.

Observed green on the merged tree, all against real disposable Postgres:

| Command | Result |
| --- | --- |
| `nx run @genie/core:test:integration --skip-nx-cache` | exit 0, 3 files / 32 tests |

## Core required-execution guard (this ticket)

`packages/core/testing/required-tests-guard.ts` names the 15 acceptance cases per file; `packages/core/tools/run-required-tests.ts` reads vitest's JSON report back and fails unless every named case was collected, executed and passed. `packages/core/package.json` makes the runner the `test:integration` entry point; `packages/core/vitest.integration.config.ts` covers `testing/**/*.test.ts` so the runner's controls are collected. This mirrors the app harness guard and stays local to core so no core file imports an app (R-39).

Observed RED and GREEN on the merged tree:

| Command | Result |
| --- | --- |
| `nx run @genie/core:test:integration --skip-nx-cache -- -t __s07_no_match__` | exit 1; all 15 mandatory cases named `mandatory case did not execute (status skipped)` |
| `nx run @genie/core:test:integration --skip-nx-cache` | exit 0, 32/32 |
| `pnpm run test:integration` (from `packages/core`) | exit 0, 32/32, including 16 runner controls |

Before this change the same filter returned green: `vitest run --config vitest.integration.config.ts -t __s07_no_match__` exited 0 with 15 skipped.

Re-proved after the review fixes at `dd49e5a`, again at `ece3333`, and finally at `b16fa10` after the second develop merge: RED exits 1 naming all 15 cases, GREEN exits 0 (32/32 at `b16fa10`, where develop's akh containment case joined the file).

## Independent review

A fresh-context semantic review of `92c8f8c..1897168` returned **PASS-with-findings**: no false-green and no false-red path found. It confirmed the 15 manifest names match vitest's `fullName` exactly (15 checked, 0 mismatches), that absolute report paths resolve correctly under `node`, `nx run` and `pnpm --filter`, that the widened include is a safe superset, and that the runner nesting is bounded. Three confirmed defects were fixed at `dd49e5a`: a per-file skip reason (was hardcoded to the migrator matrix), a stderr assertion in the real-config negative control (was exit-code only), and a spawn `error` listener (was an opaque crash on a missing vitest binary). One out-of-scope gap was filed: module packages carry no required-execution guard on their own `test:integration` (`genie-ops-center-v2-atz`).

Re-confirmation after both merges: the same reviewer returned **CONFIRMED-with-caveats** at `7172698`. Neither merge touched any of the six S0-07-owned files (`git log --merges` is empty for each), the three fixes are correct with no regression, no new false-green or false-red path was introduced, the 15 manifest names still match the unchanged acceptance files, and develop's new `packages/core/src/lib/module-contract/validate.ts` is not in the guard's or the integration collection's import graph. Its two caveats were resolved: the then-uncommitted evidence (now this record) and a second, misleading spawn-failure diagnostic, fixed at `ece3333` by short-circuiting the manifest check on the spawn-error path.

Third re-confirmation after the S0-09/akh merge: the same reviewer returned **CONFIRMED-with-caveats** at `b16fa10`. The merge touched none of the six S0-07-owned files; the manifest was re-derived against the live report and still matches all 15 case names (the tenant-context file gained an akh case and kept both `wwc` names); the merge took develop's `apps/genie/package.json` wholesale, so `test:integration` retains `dependsOn: [build, build-image, test:e2e:fixture, test:e2e:dev]` and S0-07 introduced no app wiring change; the earlier fixes remain valid with no new false-green or false-red. Its caveats are informational: `genie-ops-center-v2-c74` (an S0-09 app-fixture defect, not S0-07), and the akh containment case being deliberate optional coverage in the core manifest.

Fourth re-confirmation after the c74 merge: the same reviewer returned **CONFIRMED-with-caveats** at `97592ef`. The merge changed exactly one file, develop's `apps/genie/testing/required-runner.test.ts`, and touched none of the six S0-07-owned files; the core guard, runner and manifest were byte-identical to the version it had re-reviewed; c74 is resolved on develop and the app runner is no longer red. Its one actionable caveat, that the core CLI synthetic fixtures were still hand-written where the app now derives them from the manifest, was fixed at `3e980e1` by porting the app's manifest-derived helpers, so the core controls cannot drift on the next manifest change either.

## Gates on the merged baseline

All at `3e980e1`, the final tip (develop `2713701`).

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm run test:integration` (from `packages/core`) | exit 0, 32/32 |
| `nx affected -t build test lint typecheck --base develop --skip-nx-cache` | exit 0, 16 tasks across 5 projects |
| `pnpm exec oxfmt --check --disable-nested-config .` | pass, 282 files |
| `npx supercov quality patch --base develop` | exit 0; advisories on the guard mirror the app harness (deep nesting, long method, boundary-driven duplication) |
| `nx run @genie/app:test:integration --skip-nx-cache` | exit 0, 11 files / 98 tests; isolation file 2/2 |

## Corrections and limits

- **`pnpm --filter @genie/core test:integration -- -t <filter>` inserts a literal `--`** before the forwarded args, which vitest treats as end-of-options and swallows the runner's reporter/output-file flags. The run still fails closed (`Failing closed.`), but the violation text is the wrong one. `pnpm run test:integration -t <filter>` and `nx run @genie/core:test:integration -- -t <filter>` forward cleanly and name the skipped cases. Left as the app harness behaves; not fixed to keep parity.
- **The containment proof is the `wwc` repair's own verification**, recorded on `wwc`. This ticket does not close `wwc`.
- **The full app mandatory runner is subject to the documented Testcontainers flake.** Earlier attempts at host load 13-19 exited 1 on the `testcontainers` 10s port-bind wait (`transport.integration.test.ts`, `viewer-background.integration.test.ts`) and once on `docker run -p 3412` "address already in use". The isolation file passed 2/2 in every attempt and the guard failed closed, so no S0-07 assertion was ever affected. After confirming no stale S0-07-owned containers and no listeners on ports 3400-3413, a clean retry at `7172698` passed the whole suite: exit 0, 10 files / 89 tests. No product or test code was changed to accommodate the host.
- **The app runner's c74 blocker is resolved.** S0-09 (00124d7/905f9bd) added `testing/devtools-exclusion.test.ts` to the app manifest without the matching synthetic fixture, so `@genie/app:test:integration` was red on develop itself; filed `genie-ops-center-v2-c74` (P1, owner S0-09). Develop fixed it at `2713701`/`c92c8a3` by deriving the app fixtures from the manifest, and the final merge brought it in; the app runner is green at `3e980e1` (11 files / 98 tests). S0-07 did not edit the app file. The core runner test was switched to the same manifest-derived fixtures at `3e980e1`, so its own controls cannot drift on a future manifest change either.

## Not proved

- The app/image/CI wiring of this matrix (installed-image acceptance, customer image matrix, all four CI layers) is S0-11's owned result and was not run here.
- The core guard's manifest is fixed to the current case names; a future rename must update it, by design.
- No integration into `develop`, no push, no Bead closure.
