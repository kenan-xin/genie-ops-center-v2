# S0-12 — Record integrated Spec 0 acceptance and Section 1 handoff (G5)

Bead: `genie-ops-center-v2-1rd.12`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: Every Spec 0 AC-1–AC-29 including AC-2a; plan G1–G5 and stop conditions.

## Dependencies and worktree ownership

Hard prerequisites: [S0-11](../11-customer-images-and-ci/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: Integrated acceptance evidence and final targeted corrections only within Spec 0; evidence index linked from ticket, not a new feature tranche.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Run consolidated acceptance on the integrated revision with real toolchain/production candidate, trace every AC to command/result/evidence and its owner ticket.
- Verify G1/G2 evidence still applies after later changes; rerun affected compatibility/startup/header proofs rather than treating old pass as permanent.
- Confirm all four layers and mandatory isolation ran, generated-module stage limits, no deferred business features, and runtime/customer confidentiality.
- Record unresolved environment-only checks honestly. Section 1 may rely on foundation only after acceptance; actual externally authorized publishing remains an explicit release action.

## Acceptance and tests

- Run full prescribed acceptance including clean build, generator disposable fixture, local cache matrices, migration concurrency, image smoke, Storybook component tests and both E2E viewports.
- For AC-5 and AC-24, record S0-11's build-input exclusion evidence: the builder-stage prune and its folder check with the build log of kept and removed folders, the empty-selection and fixture-image builds that prune `placeholder`, the failing-import tests with their control, and the negative test for an unselected folder (`pg4`, 2026-09-23). A scan of built chunks for excluded module code is not expected evidence.
- Check no empty/skipped target disguises success and evidence is tied to exact integrated revision/versions.
- If actual registry-push acceptance has not been authorized/exercised, list it as outstanding and keep full G5 acceptance open; safe publish-order tests do not prove real push.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No new architecture decision, design synchronization, tickets for later sections, production rollout or automatic release.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G5 closes only with all mandatory evidence, including any separately authorized external acceptance. Failed gate returns to owning bead; do not label foundation complete on partial results.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Collect integrated naming validation, import-boundary, generator, graph/cache, story and image proof alongside existing acceptance. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.

## Develop audit, 2026-09-21

Foundation is not accepted merely because S0-01 through S0-03 are closed. Join every AC against the exact integrated revision, including ygn naming completion, canonical staged-hook behavior evidence for AC-2/R-5b/R-8, and 3yv real preset-consumption proof. Live checkout hook activation/proof (2o4) remains a separately authorized rollout, not an added G5 gate unless the owner explicitly requires it. Existing runner and disposable-dispatcher evidence must be assessed for the canonical behavior, not mislabeled as live activation. Deferred product/dependency decisions are not automatically blockers. Keep G5 open while required external push evidence or any mandatory test layer remains unproved.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.
