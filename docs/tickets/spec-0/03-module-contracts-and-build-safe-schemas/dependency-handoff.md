# S0-03 dependency slice and shared-file handoff

Prepared 2026-09-20 for `genie-ops-center-v2-lbt`. **Prepared, not accepted or transferred.** S0-02 adoption remains blocked until the integration owner accepts this slice on develop and explicitly transfers ownership. S0-03 remains in progress; Phase B has not started.

## Reconciled baseline

- Accepted develop: `cb5b010` (S0-01 closed).
- Previous S0-03 head: `6de18f2`.
- Clean merge of the accepted baseline into S0-03: `7a060a5`.
- Bounded correction source: `76c53a2`.

Merge and commit commands used a command-local disabled hooks path, avoiding the installed automatic Dolt pull. Repository hook configuration was not changed. No push, remote sync, hook activation, or merge into develop occurred.

The previous independent review of `66b1c3d` identified two real blockers. Both are corrected: the coverage probe copies the actual core Vitest configuration and resolves its imports using core's dependency directory; executable core tests no longer import the config package. The premature `./contracts` export is removed. It must land atomically with the real `contracts/index.ts` in Phase B; no dummy implementation was added.

## Minimal independently integrable slice

Use [dependency-slice.patch](dependency-slice.patch), based on develop `cb5b010`. Do not cherry-pick `66b1c3d` unchanged: it contains the premature export. Do not merge the full S0-03 branch merely to obtain its pins.

| File | Change |
| --- | --- |
| `packages/core/package.json` | Add only the five pins below |
| `pnpm-lock.yaml` | Matching importer entries and resolved dependency records |

| Dependency | Pin | Placement |
| --- | --- | --- |
| `drizzle-orm` | `0.45.2` | core dependency |
| `pg` | `8.23.0` | core dependency |
| `zod` | `4.6.5` | core dependency |
| `@trpc/server` | `11.19.0` | core devDependency |
| `@types/pg` | `8.23.1` | core devDependency |

Patch SHA-256: `f05e79c774040b79bd22c9b3efa043bdc935a5d22f68876d34736b2b1364d25d`.

The patch excludes Phase A implementation, coverage changes, the contracts export, and Storybook adoption. It preserves S0-01's config-local `@oxlint/plugins` entry. Root manifest, `nx.json`, `pnpm-workspace.yaml`, TypeScript/Vitest pins and React-family pins are unchanged. S0-03's baseline remains Vitest 5.0.1 until S0-02's separately approved adoption; this is not an instruction to revert S0-02's approved 4.1.11 pin. React/react-dom/@types/react/@types/react-dom agreement remains 19.3.0, installed only where the relevant owner requires them.

## Validation

- Reconciled branch: frozen install with lifecycle scripts disabled passed.
- Uncached combined Nx lint/typecheck/test/validate/build passed across five projects: core 48, config 175, generators 51, workspace validation 14, UI/app one each. No build task exists; no build or E2E proof is claimed.
- Formatting passed after tests finished. Running formatter checks concurrently with fixture-writing suites temporarily exposed `__antislop__.ts`; the final check runs after cleanup.
- Coverage negative control: restricting the **actual** core config to `src/**/*.test.ts` makes the collection assertion fail because contracts are absent. The original config was restored byte-identically; the restored full suite passed. The fixture also proves exclusion of testing and story files.
- Minimal patch: `git apply --check` passes against actual develop `cb5b010`. A separate temporary manifest-only workspace containing that baseline plus this patch passes frozen install with lifecycle scripts disabled. This is frozen-install proof, not fresh dependency-resolution proof or an independent whole-source review.
- Naming search over S0-03's existing core and shared Vitest source found no old module package spelling or hardcoded module package path requiring a rename. The new shared invariant is inherited from S0-01. Phase B fixtures must use `@genie/module-placeholder`, folder `packages/modules/placeholder/`, id `placeholder`; `1rd.1.5` belongs to S0-03's validator work. No module IDs, tenant behavior or permission identities changed.

Source checks ran on the tree committed as `76c53a2`; subsequent handoff documentation does not alter that source. This correction has not received a new independent reviewer verdict. Historical review and combined S0-02 scratch results are not current union acceptance evidence.

## Ownership transition, pending acceptance

| Surface | Until acceptance | After explicit accepted handoff |
| --- | --- | --- |
| Root manifests, lockfile, `nx.json` | Reserved for this dependency handoff; no overlapping S0-02 adoption writes | S0-02 owns bounded compatibility adoption |
| `packages/core/package.json`, core tsconfig | Coordinate S0-03 contract needs with S0-02 React/test needs | Preserve union of both owners' accepted requirements; no wholesale side replacement |
| `packages/config/src/vitest/unit.ts` | S0-03 coverage change remains branch-local | Coordinate with S0-02 shared preset before any later union |
| Core Phase B source | S0-03; still paused in this preparation | Requires its separate execution authorization; not transferred to S0-02 |

Integration-owner acceptance sequence: verify the patch hash and applicability on the current develop head; inspect/apply the two-file slice; run the integrated install/gates; record the new accepted revision and explicit writer transfer on `lbt`, `1rd.3` and `1rd.2`. S0-02 then updates its baseline, rechecks its backed-up adoption patch and refreshes hashes/validation. Close `lbt` only once its acceptance criteria, including the S0-02 applicability recheck, are recorded. This document does not authorize those integration actions.

Keep the unexecuted S0-03 implementation plan. This handoff supersedes its historical S0-01-blocked status and premature-export instruction, not its remaining Phase B obligations. Preserve the canonical tenant-module visibility story throughout.
