# S0-03 — Define foundation module contracts and build-safe schemas

Bead: `genie-ops-center-v2-1rd.3`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-11–R-16, R-17/R-18 type surface, R-31 schemas, R-48 serializer, R-56; AC-3 contract portion, AC-2a, AC-23 contract portion, AC-29 declaration portion.

## Dependencies and worktree ownership

Hard prerequisites: [S0-01](../01-workspace-and-build-inputs/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: Core public types/contract validators, lazy authorization stub, tenant-config schemas, contract-only fixtures. Does not edit apps/storybook or real placeholder presentation/server implementation.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Define every Module point with final public signatures; implement only foundation behavior and type/validate later event/job/capability/inbound/default-role points without their services.
- Provide build-safe TenantContext type and strict tenant.yaml/branding seed schemas owned by core for the generator. No deployment values parsed during import.
- Implement request-owned lazy can()/scopesFor() loader granting only placeholder:read, refusing all other keys; consumers keep final signatures.
- Define optional category provider and settings metadata/AND permission shapes exactly as canonical module-contract; no category dispatch or Settings runtime.
- Own pure minimal CSP validation/serialization and provider shape. Origins only, omit/empty/failure deny, deduplication, no directive injection. Keep runtime header emission in S0-05.

## Acceptance and tests

- Positive/negative type and contract fixtures cover all points, five field kinds (sixth rejected), workspace use/admin keys, pinned maximum six, zero/duplicate landing flags, record resolver optional path and Categories/Settings shapes.
- Many authorization calls in one request read loader once; separate requests remain separate; only placeholder:read succeeds.
- CSP omitted/empty/deduplicated/invalid/throwing and two-context provider cases cannot broaden policy. Import schemas with deployment env absent and assert no services start.
- Preserve import direction including testing code and schema subpath; no runtime dependency from config/tooling.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No real identity/entitlements, default-role seeding, settings/category UI/services, worker or module lifecycle implementation.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

May proceed beside G1 after S0-01 because this is independent declaration work. A declaration requiring later business behavior is a stop, not scope expansion.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Do not merge, push, publish or run Dolt remote sync without authorization. Repository policy also requires explicit authority for commits. If review-ready but not integrated, keep the bead open/in progress with that note. Only the integration owner closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.
