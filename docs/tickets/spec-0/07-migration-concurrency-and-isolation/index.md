# S0-07 — Complete migration concurrency, recovery and isolation proof

Bead: `genie-ops-center-v2-1rd.7`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-20, R-24–R-28, R-38/R-39; AC-4/AC-6/AC-9/AC-10; plan G3 database portion.

## Dependencies and worktree ownership

Hard prerequisites: [S0-05](../05-production-startup-and-csp-g2/index.md).

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: Core migrator hardening and database test fixtures; app isolation test assertions/reporting. No app build graph or generator-template changes.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Extend the retained migrator from G2 with full multi-process and failure recovery matrix; no alternate test-only runner.
- Assert one backend session owns fixed advisory lock across all history transactions and ledger operations; preserve fixed key and configured timeout.
- Ensure failed/unhealthy startup never serves; later rerun applies missing work only. Preserve completed-history forward-only semantics.
- Make skipped/missing app two-context isolation test detectable as failure for final CI wiring.

## Acceptance and tests

- Two independent migrator processes: second executes no history while first holds lock, proceeds only after release or times out; subsequent run succeeds.
- Injected history failure, acquisition timeout, connection loss, unlock/reset uncertainty, active rollback and destroyed-client paths preserve original error and never return unsafe client.
- Core and module history order matches image/preset; idempotent fresh and migrated DB reruns.
- Mandatory two-context router reads stay isolated, using module-owned factories and generic core helpers with no core-to-module import.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No installed-module reconciliation, decommission, downgrade rollback, worker/setup command lifecycle or Section 1 deployment tables.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

G3 database evidence. Stop if real Drizzle/pg behavior cannot preserve the dedicated-session invariant; no pooled fallback or skipped isolation test.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Do not merge, push, publish or run Dolt remote sync without authorization. Repository policy also requires explicit authority for commits. If review-ready but not integrated, keep the bead open/in progress with that note. Only the integration owner closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.
