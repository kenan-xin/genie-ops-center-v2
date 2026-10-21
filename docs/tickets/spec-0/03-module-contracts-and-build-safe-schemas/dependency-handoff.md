# S0-03 dependency slice and shared-file handoff

Historical execution record: S0-03 was integrated and closed at `9f67536`; see the [current audit](../audit-2026-09-21.md). Earlier pauses, remaining-task lists and exclusive writer windows below are not current dispatch instructions.

Prepared 2026-09-20 for `genie-ops-center-v2-lbt`. **Prepared, not accepted or transferred.** S0-02 adoption remains blocked until the integration owner accepts this slice on develop and explicitly transfers ownership. S0-03 remains in progress; Phase B has not started.

## Reconciled baseline

- Accepted develop: `cb5b010` (S0-01 closed).
- Previous S0-03 head: `6de18f2`.
- Clean merge of the accepted baseline into S0-03: `7a060a5`.
- Bounded correction source: `76c53a2`.

Merge and commit commands used a command-local disabled hooks path, avoiding the installed automatic Dolt pull. Repository hook configuration was not changed. No push, remote sync, hook activation, or merge into develop occurred.

The previous independent review of `66b1c3d` identified two real blockers. Both are corrected: the coverage probe copies the actual core Vitest configuration and resolves its imports using core's dependency directory; executable core tests no longer import the config package. The premature `./contracts` export is removed. It must land atomically with the real `contracts/index.ts` in Phase B; no dummy implementation was added.

## Minimal independently integrable slice

Applied. The five pins and their matching lock entries are on develop, so the slice that `dependency-slice.patch` carried needs no further application and the patch file is removed. The table below stays as the record of what landed. Do not cherry-pick `66b1c3d` unchanged: it contains the premature export. Do not merge the full S0-03 branch merely to obtain its pins.

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

The slice excluded Phase A implementation, coverage changes, the contracts export, and Storybook adoption. It preserves S0-01's config-local `@oxlint/plugins` entry. Root manifest, `nx.json`, `pnpm-workspace.yaml`, TypeScript/Vitest pins and React-family pins are unchanged. S0-03's baseline remains Vitest 5.0.1 until S0-02's separately approved adoption; this is not an instruction to revert S0-02's approved 4.1.11 pin. React/react-dom/@types/react/@types/react-dom agreement remains 19.3.0, installed only where the relevant owner requires them.

## Validation

- Reconciled branch: frozen install with lifecycle scripts disabled passed.
- Uncached combined Nx lint/typecheck/test/validate/build passed across five projects: core 48, config 175, generators 51, workspace validation 14, UI/app one each. No build task exists; no build or E2E proof is claimed.
- Formatting passed after tests finished. Running formatter checks concurrently with fixture-writing suites temporarily exposed `__antislop__.ts`; the final check runs after cleanup.
- Coverage negative control: restricting the **actual** core config to `src/**/*.test.ts` makes the collection assertion fail because contracts are absent. The original config was restored byte-identically; the restored full suite passed. The fixture also proves exclusion of testing and story files.
- Minimal patch: `git apply --check` passes against actual develop `cb5b010`. A separate temporary manifest-only workspace containing that baseline plus this patch passes frozen install with lifecycle scripts disabled. This is frozen-install proof, not fresh dependency-resolution proof or an independent whole-source review.
- Naming search over S0-03's existing core and shared Vitest source found no old module package spelling or hardcoded module package path requiring a rename. The new shared invariant is inherited from S0-01. Phase B fixtures must use `@genie/module-placeholder`, folder `packages/modules/placeholder/`, id `placeholder`; `1rd.1.5` belongs to S0-03's validator work. No module IDs, tenant behavior or permission identities changed.

Source checks ran on the tree committed as `76c53a2`; subsequent handoff documentation does not alter that source. The independent review of handoff `254273f` verified the two-file patch, isolated frozen install, and bounded correction (targeted core coverage suite: 5/5). Its verdict was CHANGES REQUESTED because the proposed writer transfer was incomplete; broader gates and mutation logs remained inherited evidence. The ownership proposal below addresses that finding and awaits scoped re-review. Historical combined S0-02 scratch results are not current union acceptance evidence.

## Ownership transition, pending acceptance

This is a **proposal only**. Until the integration owner accepts the dependency slice and records the transfer, shared-file adoption writes remain reserved and S0-02 stays blocked. Approval of this document or its review alone does not transfer ownership.

After that explicit transfer, the S0-02 implementer is the sole writer of the following shared files for the bounded adoption window. S0-03 supplies its required deltas but does not concurrently edit these files. The integration owner arbitrates conflicts in every row; neither implementer may resolve a semantic conflict by choosing a whole branch's version.

| Shared surface | Proposed writer after accepted transfer | Required preservation and conflict rule |
| --- | --- | --- |
| `package.json` | S0-02 implementer | Apply only the approved compiler/API aliases and compatibility dependencies. Preserve unrelated workspace scripts and pins; conflicts go to the integration owner before writing. |
| `pnpm-workspace.yaml` | S0-02 implementer | Apply only the approved version-scoped compatibility extension. Preserve strict peers and release-age policy; no exemptions or range widening. Integration owner decides any incompatible requirement. |
| `nx.json` | S0-02 implementer | Register the approved plugin and retain one owner per target, selection/cache inputs, and S0-01 validate wiring. Integration owner decides graph or target-ownership conflicts. |
| `packages/core/package.json` | S0-02 implementer | Retain all five accepted S0-03 pins while adding approved React/test requirements. Preserve the agreed React family 19.3.0 and approved Vitest 4.1.11 adoption. Do not restore `./contracts` before its actual implementation is separately accepted. S0-03 lint/export deltas remain a later source-integration responsibility; integration owner approves that union. |
| `packages/core/tsconfig.json` | S0-02 implementer | Preserve S0-01 fixture exclusions and strictness while accommodating browser story configuration. Retain S0-03's contracts/testing coverage requirements for later source integration; browser support must not silently relax the server boundary (bead `owz`). Integration owner decides the configuration union before combined source acceptance. |
| `packages/config/src/vitest/unit.ts` | S0-02 implementer | Own compatibility-related edits during adoption. Preserve unit/component separation and testing/story exclusions. S0-03's branch-local top-level contracts collection delta must remain in its branch and be carried into the later accepted source union with coverage proof; do not drop it or treat it as included in this dependency-only patch. Integration owner approves any conflicting include/exclude change. |
| `pnpm-lock.yaml` | S0-02 implementer | Regenerate only from the reconciled approved manifests, preserving the five S0-03 pins and S0-01 config-local `@oxlint/plugins` importer. No wholesale ours/theirs replacement. Integration owner resolves pin conflicts before regeneration; prove fresh resolution and frozen install as required by adoption. |

The integration owner owns application of the dependency-only patch to develop and approval of later source unions. The table does not expand that patch beyond its two files. When S0-03 source is later integrated, the integration owner serializes the shared-file union with S0-02's adopted baseline and re-runs the relevant coverage/typecheck gates; branch-local coverage and lint changes must not be silently discarded.

S0-03 retains ownership of core Phase B source, including contract validators and kebab-case validation (`1rd.1.5`); execution remains separately paused. If that work needs a shared-file change during the adoption window, S0-03 submits it to the integration owner, and the designated S0-02 writer applies only an approved delta. At the end of adoption, the integration owner records the next writer on all three beads before S0-03 resumes shared-file edits. No automatic concurrent ownership or return transfer is implied.

Integration-owner acceptance sequence:

1. Obtain approval of this proposed ownership contract and verify the patch hash/applicability on current develop.
2. Apply only the dependency slice and run the integrated install and applicable gates. This does not accept the whole S0-03 branch.
3. Record the accepted revision and explicit adoption-window writer transfer for every row above on `lbt`, `1rd.3`, and `1rd.2`.
4. S0-02 updates its baseline and performs the backed-up adoption patch applicability recheck, refreshing hashes and validation. That recheck is permitted by the recorded transfer while `lbt` remains open; it does not apply the adoption patch.
5. Close `lbt` only after the accepted-slice evidence, transfer, and S0-02 applicability recheck are recorded. Only then may the already approved bounded S0-02 adoption proceed; G1 remains open until its own integrated proof passes.

These are future steps, not authorization to integrate, transfer, resume Phase B, or apply S0-02 adoption now.

Keep the unexecuted S0-03 implementation plan. This handoff supersedes its historical S0-01-blocked status and premature-export instruction, not its remaining Phase B obligations. Preserve the canonical tenant-module visibility story throughout.
