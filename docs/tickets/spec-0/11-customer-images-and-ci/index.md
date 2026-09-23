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
- Inspect image filesystem/history for secrets, the build argument, excluded migration files and dev-only tooling; two selections start. Excluded-module code absence is proved at the build input, as the pg4 addendum below states, not by scanning built chunks. Publication must consume same smoke-tested image identity.
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

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Verify selected image/staging contents and absence of excluded module names, paths and histories under the new naming. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.

## Develop audit, 2026-09-21

Production Dockerfile, customer wrapper and release CI are absent on develop; extend the retained S0-05 image rather than create another. Compose S0-06 through S0-10 proofs. Wire nonempty real integration/isolation and all four test layers, image/staging exclusion and exact-candidate smoke-before-publish. Actual remote publishing needs separate authorization; a stub publish test does not satisfy external acceptance.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.

## Build-input exclusion (pg4), 2026-09-23

Owner decision in Bead `genie-ops-center-v2-pg4`, recorded in Spec 0 AC-24 and DEC-33. It supersedes every earlier instruction in this ticket to find excluded modules by package-name, path or source-marker needles in built output.

- The release build uses a pruned Docker context that holds only the `MODULE_INCLUDE` module packages.
- A context check compares the module folders present in the context with `MODULE_INCLUDE` and fails the build on any other module folder. Install failure is not the check, because a frozen install passes and leaves a dangling link when a listed module folder is missing.
- A test proves that a direct import of an excluded module fails the build.
- The excluded-module needle scan of built chunks is removed. The image scan keeps its secret and build-argument checks (`MODULE_INCLUDE` is the only build argument, R-32).
- The smoke test keeps its excluded route, table and migration-history checks. No bundler migration is part of this ticket.
