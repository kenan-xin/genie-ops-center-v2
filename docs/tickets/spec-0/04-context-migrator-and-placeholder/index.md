# S0-04 — Build permanent tenant-context, migrator and placeholder foundation

Bead: `genie-ops-center-v2-1rd.4`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-13–R-20, R-24–R-28, R-37–R-39, R-44–R-46; AC-3/AC-6/AC-10/AC-14 foundation; plan permanent G2 prerequisites.

## Dependencies and worktree ownership

Hard prerequisites: [S0-02](../02-storybook-compatibility-g1/index.md), [S0-03](../03-module-contracts-and-build-safe-schemas/index.md). Original disposable endpoint proof `2tc` is closed. The [post-integration review](integrated-review.md) records the bounded repairs and recovered real-database proof; S0-04 remains open only until that reviewed union is integrated and recorded.

S0-02 and S0-03 are integrated and closed. S0-04 implementation is integrated at `13800cd`; preserve it and repair only confirmed findings on a branch from current develop. Review repair ownership is tracked on its individual beads. Do not restart the historical implementation or infer acceptance from its earlier closure.

Owned surface: Core context/environment/logging/error primitives and migrator; generic core test helpers; placeholder server declaration/router/schema/history and module-owned factories.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Implement fixed-member createTenantContext factory and runtime validation profiles, with no global connection or import-time initialization; Section 0 must not require later auth/setup credentials.
- Create the real placeholder_record schema/migration, permission-checked read router, navigation/config/CSP declarations and module-owned factories; reuse S0-02 presentation components. No placeholder landing flag.
- Implement the final dedicated-session migrator over minimal core migration-history scaffold and placeholder history, core first then registry order. All ledgers, lock, migration transactions and unlock use one reserved client.
- Implement timeout, rollback/unlock/reset-or-destroy, original-error preservation and fail-closed connection loss. No Section 1 tables to fill core history.
- Create generic Testcontainers helpers using the same histories, redacted structured logging and safe shared error catalogue needed by startup and later transport adapters.

## Acceptance and tests

- Real Postgres fresh/rerun histories, same-session lock/ledger proof, timeout and failure cleanup; no mocked database. S0-07 broadens adversarial multi-process cases.
- Placeholder router authorized read and denial of all other keys using unchanged loader; module factories stay out of core.
- Environment validation failure precedes connection. Logger redacts nested secrets/headers/token links and emits request/tenant/user correlation without inventing authenticated users.
- Factory can construct independent contexts; app-owned composed mandatory isolation test is completed in S0-05.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No app listener/bootstrap hook selection, production header emission, Section 1 services/tables/worker/CLI/setup or cross-history rollback guarantee.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

Permanent production paths, not disposable prototypes. Stop on extra pool/global DB, pool-dispatched advisory-lock work, broadened authorization or later-section schema demand.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Use packages/modules/placeholder and @genie/module-placeholder; keep placeholder identity, permission keys and migration history unchanged. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The naming convention and rework sequence are approved; follow current prerequisite acceptance and ticket-specific execution authority. Later consumer proof remains required.

## Develop audit, 2026-09-21

Historical pre-integration snapshot below. The [integrated review](integrated-review.md) supersedes its status and dispatch instructions without discarding its original scope.

Resume the retained feature/s0-04-context-migrator branch at 61b2408; do not recreate its context, logger, errors, migrator or placeholder. It is not merged into develop. Recorded scoped code review passed, but PostgreSQL acceptance did not run. Docker info now responds (29.8.0, 2026-09-21); 2tc owns confirmation of disposable Testcontainers/Postgres access, not an assumed host restart. Keep this ticket open until real fresh/rerun histories, same-session lock/ledger, timeout/cleanup and router proof pass and the reviewed union is integrated. The branch has a nonempty placeholder test:integration target; expand missing real-DB cases rather than treating its three router cases as full migrator acceptance. App composition/two-context/browser proof remains S0-05.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.
