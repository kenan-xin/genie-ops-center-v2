# S0-10 — Complete Storybook discovery, confidentiality and cache matrix

Bead: `genie-ops-center-v2-1rd.10`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-41a–R-41e/R-3a, AC-27/AC-28/AC-29; UI development contract.

## Dependencies and worktree ownership

Hard prerequisites: [S0-06](../06-selection-cache-and-build-graph/index.md), [S0-08](../08-module-and-tenant-generators/index.md), [S0-09](../09-developer-experience-and-documentation/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: Storybook discovery/target inputs, browser-safe story fixtures and selection tests; package-local host configuration.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Complete automatic selected-module discovery with shared resolver, no runtime modules.ts dependency and no blanket customer app glob.
- Record actual owners/dependencies in Nx for stories/components/tokens/messages/providers/fixtures/config/lockfile/selection; separate unit/component projects and outputs.
- Exercise generated UI module from S0-08, optional headless path and explicit custom-app story selection.
- Confirm docs/a11y/MCP content respects scope and local confidentiality; no customer runtime assets.

## Acceptance and tests

- All-available, two explicit selections, explicit empty UI/core-only, unknown ids; repeat identical selection with local cache.
- Inspect static index/chunks/assets/source maps/docs/fixtures for excluded identifiers/content, not only sidebar invisibility.
- Mutate story, source, token, message, provider and inventory; verify affected targets/cache invalidation. Serve/watch uncached.
- Generated UI appears/tests without host or CI edit; interaction/a11y failures propagate and collection stays nonempty; MCP never exposes excluded content.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No cloud Storybook, remote cache, legacy runner, future business screen catalogue or E2E substitution.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G4 Storybook completion. Scope leak or addon incompatibility reopens relevant G1 proof; don't silently drop required features.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Use validated inventory roots for selected story discovery; test changed package metadata invalidation and excluded-story absence. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.
