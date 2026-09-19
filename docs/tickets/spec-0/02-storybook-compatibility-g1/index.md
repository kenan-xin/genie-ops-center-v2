# S0-02 — Prove minimal Storybook and component-test compatibility (G1)

Bead: `genie-ops-center-v2-1rd.2`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-41a–R-41e, AC-27 (early slice); docs/architecture/ui-development.md; plan Stage 1/G1.

## Dependencies and worktree ownership

Hard prerequisites: [S0-01](../01-workspace-and-build-inputs/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: apps/storybook; representative packages/ui and placeholder presentation stories; browser-safe fixtures; first shared Storybook preset implementation, all Storybook pins and associated lockfile/Nx/config changes. S0-01 reserves the extension point only. No placeholder server declarations.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- One development-only app-classified Storybook host using Next.js/Vite, official Nx serve/build inference and exactly one explicit Vitest-addon component-test owner; no legacy duplicate runner.
- Install required Docs, a11y and MCP tooling with aligned pins. Verify current official MCP instructions before the requested npx storybook add command; review generated edits and keep local agent endpoint private.
- Show documented representative UI and placeholder presentation stories plus a browser-safe Core grouping seam, using the S0-01 selector rather than runtime registry imports. Establish English fixture messages, tokens and deterministic assets; no later business screens.
- Record exact version/peer compatibility, target resolution and the G1 pass/fail disposition. Story-first behavior tests precede consuming these UI components in S0-05.

## Acceptance and tests

- Real dev launch, static build, CLI and in-UI component tests without deployment env/database/identity service; nonempty separate unit/component collection.
- Demonstrate meaningful interaction and accessibility failures fail the target, then pass after correction. Verify state reset, keyboard behavior, phone/desktop and light/dark representative states, docs and controls.
- Demonstrate local MCP agent connection and smoke check without public exposure. Record what synthetic fixtures do not prove.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No production shell/primitive catalogue, real role evaluator, E2E replacement, cloud publishing or customer runtime Storybook.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G1 BLOCKER: do not close on partial compatibility. No silent major downgrade, omitted addon, duplicate runner or product-boundary rewrite. Report failed command, versions and smallest alternatives; runtime tranche S0-04 remains blocked.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Do not merge, push, publish or run Dolt remote sync without authorization. Repository policy also requires explicit authority for commits. If review-ready but not integrated, keep the bead open/in progress with that note. Only the integration owner closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.
