# S0-02 — Prove minimal Storybook and component-test compatibility (G1)

Accepted integration is recorded in [integrated-acceptance.md](integrated-acceptance.md). Consult Beads for current status; earlier planning holds below do not reopen satisfied gates.

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

For the initial overlapping dependency change, follow [S0-03's accepted planning decisions](../03-module-contracts-and-build-safe-schemas/index.md#accepted-planning-decisions--2026-09-20): agree common pins, let S0-03 prepare the minimal contract dependencies, and consume their separately approved integrated revision before writing Storybook dependency/configuration changes. This does not transfer Storybook ownership or require the whole S0-03 ticket to finish. Record the shared-file handoff in both beads; the S0-01 start gate is unchanged.

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

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Proposed rework: after S0-01 acceptance and S0-03 ownership transfer, reconcile story/placeholder paths and recheck the staged compatibility patch; rerun affected G1 evidence. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The sequence was subsequently authorized. Follow the current acceptance/continuation record linked above; retain the shared-file protocol and outstanding consumer work.

## Historical implementation plan

The superseded `plan.md` was removed from the active documentation to avoid executing stale instructions. Its exact contents remain in Git at `4f0dbac:docs/tickets/spec-0/02-storybook-compatibility-g1/plan.md`. Use this ticket, its linked current contracts and the owning agent's current correction handoff for further work. Historical evidence and active adoption artifacts are retained.

## Develop audit, 2026-09-21

G1 is accepted at ae00f6b. Preserve official @nx/storybook inference, one Vitest-addon runner, accepted pins and compatibility bridges, ^default inputs, Docs/a11y/MCP and loopback defaults. Full selection/confidentiality proof and 2cg remain S0-10; do not repeat installation as new work.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.
