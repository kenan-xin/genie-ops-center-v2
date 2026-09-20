# S0-08 — Deliver stage-appropriate module and tenant generators

Bead: `genie-ops-center-v2-1rd.8`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-29–R-31, R-39, R-41d, R-56; AC-7/AC-23/AC-27/AC-29 generated coverage.

## Dependencies and worktree ownership

Hard prerequisites: [S0-05](../05-production-startup-and-csp-g2/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: tools/generators module:new and tenant:new implementations/templates and disposable generator fixtures; no resolver implementation ownership.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Scaffold module package with every declaration point, module tag, three-folder layout/READMEs, own schema/history/ledger/factories and ctx.tenant procedure/job signatures.
- Use empty typed CSP provider and category/settings declaration coverage matching canonical contracts; no module runtime extension or new permission grants.
- Generated UI includes documented stories, browser-safe fixtures and meaningful component assertions; headless modules get no dummy story.
- Tenant generator writes all seven deploy files including values.yaml and validates strict core-owned tenant/branding schemas. No secret or hosting-mode field.
- Exercise disposable generated module selection/discovery without changing host module list or CI.

## Acceptance and tests

- Generated module without hand edits passes lint/typecheck/unit, real schema/migration and router-denial integration, phone/desktop denied E2E, and UI component tests when UI exists.
- No reuse of placeholder:read, test principal, mock authorization grant, skipped layer or leaked protected data. Existing placeholder success remains.
- Generated UI auto-discovery and story execution pass; later S0-10 completes confidentiality matrix.
- Tenant files exact count/names; unknown/misplaced branding keys fail. Generated destination import rules and all public contracts pass.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No real-role success before Section 2, no working setup/worker/genie-ops or production stack provisioning; compose file is the specified generator artifact.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G4 generator contribution. If a generated test needs broader stub permissions or later services, stop and fix the stage boundary instead.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Do not merge, push, publish or run Dolt remote sync without authorization. Repository policy also requires explicit authority for commits. If review-ready but not integrated, keep the bead open/in progress with that note. Only the integration owner closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Keep the <id> folder and generate @genie/module-<id> package names with unprefixed IDs; pass shared validation including hand-edited-manifest rejection. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. Implemented-ticket rework awaits owner approval of the proposed sequence; existing integration and shared-file gates remain in force.
