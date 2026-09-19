# S0-11 — Complete customer image matrix and Spec 0 CI gates

Bead: `genie-ops-center-v2-1rd.11`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-9/R-32–R-36a/R-40/R-41/R-51–R-55; AC-8/AC-17/AC-18/AC-19/AC-21/AC-22; plan Stage 5.

## Dependencies and worktree ownership

Hard prerequisites: [S0-06](../06-selection-cache-and-build-graph/index.md), [S0-07](../07-migration-concurrency-and-isolation/index.md), [S0-08](../08-module-and-tenant-generators/index.md), [S0-09](../09-developer-experience-and-documentation/index.md), [S0-10](../10-storybook-selection-and-generator-proof/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: deploy production image completion, scripts/build-customer-image.sh and release wrapper, CI workflows and repository-wide acceptance wiring.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Extend the one production Dockerfile and app dispatch from G2 to every required selection; only MODULE_INCLUDE build argument, runtime secrets only, no Storybook/devtools/stories/fixtures/dev dependencies in customer runtime.
- Implement customer script consuming explicit modules.txt, isolated preparation/build, candidate smoke then push of that exact candidate; publishing noncacheable. Do not actually push during ticket development without separate release authority.
- Wire PR affected lint/typecheck/unit/integration/Storybook build/component and README/generated-registry/module-tests/isolation execution checks; develop merges full phone/desktop E2E.
- Wire release per-customer typecheck/image/smoke matrix and empty-customer default development fallback, never called customer deliverable. Retain build task coverage required by AC-1/root quality gates.

## Acceptance and tests

- Development image placeholder page and headers; customer image health/headers and absence of excluded routes/tables/history files. Explicit empty customer selection boots core-only. Fresh disposable databases per case.
- Inspect image filesystem/history for secrets, excluded modules, migration files and dev-only tooling; two selections start. Publication must consume same smoke-tested image identity.
- Inject failed smoke/typecheck/test/missing README/no module tests/skipped isolation and verify pipeline fails and no publish command executes.
- Exercise publish ordering in a safe local/test sink or stub external publish boundary; actual GHCR authentication/push evidence requires separate release authorization, never claim it ran.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No customer credentials/package access/runbooks, hosted deployment/monitoring, setup/worker/CLI execution or real release publication without approval.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

Prerequisites include both G3 branches and G4 contributions. Any image confidentiality or smoke failure blocks publication; cannot skip gate via cache.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Do not merge, push, publish or run Dolt remote sync without authorization. Repository policy also requires explicit authority for commits. If review-ready but not integrated, keep the bead open/in progress with that note. Only the integration owner closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.
