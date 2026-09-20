# S0-02 / G1 integrated acceptance

Accepted locally at `ae00f6b6b559713e89fd56d671842860536c84c9`, 2026-09-20. Closed status verified against Beads during documentation reconciliation on 2026-09-21. These are recorded integration results, not tests rerun during documentation cleanup.

## Delivered and reviewed

- Adoption `556289c`: official Nx Storybook plugin, native compiler 7.0.2, tooling API 6.0.3 via wrapper 6.0.2, resolver-local TypeScript 5.9.3, compatibility-only ESLint 10.11.0. Executed lint remains Oxlint.
- Dependency-story cache correction `b9debfd`: `build-storybook` and `test-storybook` consume dependency `^default`, preserving production exclusions and `MODULE_INCLUDE`. Independent cache review approved the change.
- Documentation correction `ae00f6b`: official plugin/adopted targets and Vitest 4.1.11. Whole-branch review at `b9debfd` requested these corrections; scoped re-review approved them. The original rejection is historical, not silently rewritten as an approval of the earlier revision.

## Prerequisite dependency handoff

S0-03 dependency slice entered develop at `218f8ce`: only `packages/core/package.json` and `pnpm-lock.yaml`. Pins: zod 4.6.5, drizzle-orm 0.45.2, pg 8.23.0, @trpc/server 11.19.0, @types/pg 8.23.1. Approved handoff revision `6747a97`, SHA256 `80b0f282d905dfc9fab6f4ea5695155adf00f786d32c422daedebc5495cdb37f`. The two-file patch passed isolated frozen install and applicable gates on the accepted baseline; no Phase B source was included.

Dependency acceptance/ownership handoff (`genie-ops-center-v2-lbt`) closed after applicability at `abd5f44`: forward and three-way checks passed; reverse failed as expected because adoption was unapplied. This historical hold is satisfied. Subsequent S0-03 writer authority is in its [continuation contract](../03-module-contracts-and-build-safe-schemas/continuation.md).

## Executed integrated proof

| Check | Recorded result at ae00f6b |
| --- | --- |
| Frozen install | Passed with lifecycle scripts disabled |
| Fresh strict resolution and separate frozen clone | Both passed; fresh transitive lock changes stayed in the disposable clone |
| Uncached Nx lint/typecheck/test/validate/build-storybook/test-storybook | Six applicable targets across seven projects passed; ordinary build had no task |
| Formatting | 86 matched files passed |
| Compiler/API/plugin | Native tsc 7.0.2; tsc6/API 6.0.3; resolver-local TS 5.9.3; plugin loaded |
| Story cache, exact frozen lock | Cold 0/2 hits, repeat 2/2; modified dependency story rebuilt static output and executed a deliberately failing interaction (1 failed, 10 passed), no cache hit; byte restoration recovered 2/2 reuse twice |
| Lockfile cache | Before change 2/2; changed lock content 0/2; repeat 2/2; restored byte-identically |
| Negative controls | Empty discovery failed; invalid ARIA failed; unmapped TSX alias failed; mapping restored success; original suite restored success |
| Live UI | Docs props/stories, Controls, light/dark theme, 320/1280 preview widths, component UI run of 11 tests and final success; click/reload state verified |
| Keyboard | Enter/Space passed in automated browser interactions; no extra manual keyboard claim |
| MCP | HTTP 200, eight tools from tools/list |
| Binding | Dev 127.0.0.1:6006; inferred static ::1:4200 and HTTP 200. Both are defaults, not override-proof restrictions |
| Restoration | 786 tracked-file hashes matched the integrated tree; probe files restored and live servers stopped |

Representative gate invocation: `NX_DAEMON=false pnpm exec nx run-many -t lint typecheck test validate build build-storybook test-storybook --skip-nx-cache --output-style=static`. For cache proof, use the [recorded cache procedure](story-cache-invalidation.md) with caching enabled. Frozen and fresh installs are independent proofs; use isolated disposable checkouts for destructive negative controls.

## Disposition and limits

Closed G1/S0-02 (`genie-ops-center-v2-1rd.2`) and satisfied follow-ups: adoption docs (`p12`), Vitest citation (`1w4`), story cache (`4w0`), strict peer resolution (`8nb`), compatibility adoption (`c1u`) and host/theme (`z30`). Existing implementer assignment was retained; the integration-owner closure override bypassed only the assignee guard after dependencies and evidence passed.

Open follow-ups at acceptance: static-target override/policy (`4au`), flaky-label characterization (`j16`), compatibility ESLint removal (`kys`), core type isolation (`owz`), naming aggregate (`ygn`), and S0-10's broader selection/image/MCP confidentiality matrix. Current status/owners remain in Beads. No tenant/database/identity/E2E acceptance, hook activation or code push follows from G1.

Historical [branch evidence](evidence.md) and probe results remain valid only for their named revisions. Current upgrade/removal requirements are in [the dependency upgrade contract](../../../architecture/storybook-dependency-upgrades.md).
