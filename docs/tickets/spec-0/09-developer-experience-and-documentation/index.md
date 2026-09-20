# S0-09 — Complete developer diagnostics, i18n and UI workflow handoff

Bead: `genie-ops-center-v2-1rd.9`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-9/R-42/R-43/R-41d; AC-12/AC-13; docs/architecture/ui-development.md.

## Dependencies and worktree ownership

Hard prerequisites: [S0-05](../05-production-startup-and-csp-g2/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: App devtools mount, English message integration, developer documentation and agent-instruction pointers; package-local devtool dependency declarations.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Mount TanStack Devtools once through next/dynamic and development guard, with Query/Form/Pacer and Genie Ops Center panel; show tenant and stub permission truthfully without invented users.
- Complete English message catalogue coverage including missing-key failure behavior; no translation project.
- Confirm story-first TDD instructions in AGENTS.md/CLAUDE.md stay consistent and document root Nx commands, test boundaries, module-owned fixtures and no backend claims from stories.
- Complete folder purpose/import READMEs within touched areas; coordinate shared config/lockfile edits through the integration owner.

## Acceptance and tests

- Development tabs/panel work; production output contains no devtools packages, and runtime customer exclusion is rechecked in S0-11.
- All placeholder strings resolve via catalogue; missing key produces a visible failing check.
- UI changes have documented stories and red/green component evidence before app consumption; affected unit/component/E2E paths remain green.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No real user/group/role services, telemetry/analytics, additional languages, design import or full component library.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G4 developer-workflow contribution. No production diagnostic or secret leakage; don't change approved tokens or business UI.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Reconcile active path/package command examples while retaining historical evidence and generator CLI identity. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.
