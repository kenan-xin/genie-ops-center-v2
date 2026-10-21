# S0-06 — Complete selection-aware application build graph and local cache proof

Bead: `genie-ops-center-v2-1rd.6`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-3/R-3a, R-21–R-23a, R-52; AC-1/AC-5/AC-24; plan ownership table and G3 selection portion.

## Dependencies and worktree ownership

Hard prerequisites: [S0-05](../05-production-startup-and-csp-g2/index.md) and `genie-ops-center-v2-5ph` (normally satisfied before G2).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Reuse the task-assigned dedicated worktree, including an Orca-created one; only when outside a task worktree, create one with wt from current local develop. Verify ownership and the integrated baseline before atomically claiming this bead; stop on another task's worktree or conflicting changes. A sibling worktree finishing code is not sufficient.

Owned surface: tools/generators selection hardening, app registry/image-prep target metadata, isolated build-root plumbing and selection test fixtures. No module:new templates or Storybook host edits.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

Consume the integrated G2 baseline rather than recreating its generated registry or existing build, build-image and test:integration edges. Extend those targets with this ticket's selection/cache guarantees while preserving mandatory isolation execution and built-image acceptance. Record the accepted G2 revision before starting; G2 is accepted at develop `3bafa24`; verify that revision and the current approved documentation baseline before starting.

- Complete pre-hash resolver wrappers for every supported direct developer/Nx/customer entrypoint; pass serialized ordered selection and source mode, not only fingerprint.
- Declare producer outputs and consumer inputs; generation/validation before app typecheck/build, build before image-prep. Read selected source bytes for hashing without tooling execution.
- Prove isolated customer workspaces/output roots prevent registry overwrite. MODULE_INCLUDE remains only Docker argument; publishing is never cached.
- Fail selected identity mismatch/unknown id/missing entrypoint/duplicate landing; no runtime registry in tooling or Storybook.

## Acceptance and tests

- Same revision two selections, repeat identical, change modules.txt, unset vs empty. Inspect restored generated registry, bundle and staging histories, not cache labels alone.
- Delete generated output before cached run; verify cache restoration precedes consumers. Inspect actual task graph edges and config/schema/source invalidation.
- Concurrent isolated selections do not contaminate each other. Fresh image/database selected/excluded routes/tables/history checks reuse S0-05 harness; S0-11 completes release matrix.
- Throwing unselected module never evaluates; selected metadata identity mismatch fails app-owned validation; forbidden resolver imports fail.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No remote cache provider, shared mutable selection file, new orchestration framework, runtime lifecycle removal or publication.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G3 selection evidence. Any cross-customer artifact leakage blocks this ticket and image release; never mask with cache disabled.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Cover changed package metadata in graph, affected/cache and selected-output restoration; preserve empty/unset, ordering and concurrent-build isolation. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.

## Develop audit, 2026-09-21

The data-only inventory/selector/fingerprint and naming checks already exist. Consume integrated 5ph instead of implementing another path validator. Complete pre-Nx serialized selection/source-mode inputs, generation/build/image-prep edges, isolated customer roots and cache restoration/content proof. Raw MODULE_INCLUDE alone cannot represent unset/explicit identity. Publish the shared selection contract for S0-10/2cg; generator templates and Storybook host stay with their owners.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.
