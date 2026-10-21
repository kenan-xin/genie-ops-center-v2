# S0-03 — Define foundation module contracts and build-safe schemas

Accepted integration: `9f67536`, with later contract and build-safety fixes integrated. The [continuation](continuation.md) is a completed authorization record. Consult Beads and the audit below for remaining follow-ups.

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

The accepted planning decisions below supplement these criteria; they do not release the S0-01 prerequisite or approve implementation evidence.

- Positive/negative type and contract fixtures cover all points, five field kinds (sixth rejected), workspace use/admin keys, pinned maximum six, zero/duplicate landing flags, record resolver optional path and Categories/Settings shapes.
- Many authorization calls in one request read loader once; separate requests remain separate; only placeholder:read succeeds.
- CSP omitted/empty/deduplicated/invalid/throwing and two-context provider cases cannot broaden policy. Import schemas with deployment env absent and assert no services start.
- Preserve import direction including testing code and schema subpath; no runtime dependency from config/tooling.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Accepted planning decisions — 2026-09-20

1. **Use actual library types for final signatures.** Add only the dependencies needed by the public contracts, including applicable tRPC, Drizzle, PostgreSQL and React types. Use type-only imports where appropriate; do not substitute temporary structural types that S0-04 must narrow. Determine dependency versus devDependency placement from public consumers and packaging, not from import syntax alone. Verify exact pins against the approved stack and compatibility requirements; this decision does not approve a major-version change or runtime service initialization.
2. **Keep authorization state request-owned.** Use a server-only request-principal wrapper carrying the lazy loader while preserving the final `can(user, permission, resource?)` and `scopesFor(user, permission)` signatures. Never place that loader on the process-wide TenantContext, persisted user record, browser DTO or shared session object. Create a fresh wrapper per request/job and share its lazy result only within that execution. S0-03 defines and tests the seam; actual request/job wiring remains with its assigned runtime tickets.
3. **Create the contracts directory only for its intended surface.** `packages/core/contracts/` holds capability interfaces and cross-module event schemas as specified by the repository layout, with only allowed zod/type imports. Keep Module composition types in the planned core module-contract location; do not turn the contracts directory into a barrel for every core type. No real capability service is introduced.
4. **Serialize the initial dependency change: S0-03, then S0-02.** Agree shared React and other overlapping pins before editing. S0-03 prepares the minimal contract dependency change; after separate approval and integration of that change, S0-02 updates its baseline and takes ownership of Storybook dependency/configuration edits. Record paths, revision and writer handoff in both beads. This is a shared-file handoff, not a dependency on completion of the whole S0-03 ticket. Work on disjoint owned files may continue after S0-01 clears. Exports, import-boundary changes and configuration also require coordination; slice 1 is not the only shared-file slice.
5. **Combine static and runtime build-safety proof.** Enforce the schema import restrictions and test public build-safe entrypoints in a fresh process with deployment variables absent. Assert that service initialization does not occur, with a meaningful failure case demonstrating the check detects forbidden initialization. A successful import alone is insufficient. These checks prove the foundation import boundary, not deployment E2E.

Implementation-plan corrections:

- R-5a permits narrowly documented anti-slop exceptions for legitimate boundary validation, framework contracts and test fixtures. Reproduce any rule conflict, document the narrow exception and verify it through lint; do not weaken types with `any` or casts or disable the rule globally merely to obtain a pass.
- Ensure all new contract files participate in Nx-owned lint, typecheck and test collection. At the reviewed S0-01 baseline, core lint scans only `src`, TypeScript includes `src/**/*.ts` and the Vitest configuration, and unit collection scans `src`; a new top-level `contracts/` directory must not escape applicable checks. Prove coverage using intentional negative fixtures.
- This guidance supersedes conflicting recommendations in `/tmp/s0-03-bounded-plan.md`; that temporary draft is not canonical and its eight slices are not independently approved by accepting these five decisions.
- Use the installed `wt` CLI to create or verify the isolated feature worktree from the approved `develop` revision, consulting its help rather than guessing syntax. Reuse correct isolation; do not nest worktrees or silently substitute raw Git worktree creation.

The start gate remains unchanged: S0-01 must be integrated, validated and closed in shared Beads before implementation or claiming S0-03. A merge or expired lease alone does not satisfy the gate. No commit or partial integration is authorized by this planning update.

## Exclusions

No real identity/entitlements, default-role seeding, settings/category UI/services, worker or module lifecycle implementation.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

May proceed beside G1 after S0-01 because this is independent declaration work. A declaration requiring later business behavior is a stop, not scope expansion.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Proposed rework: inspect contract fixtures/imports for naming impact, preserve IDs and pins, and record either focused corrections or an evidenced no-op before handoff. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The sequence was subsequently authorized. Follow the current acceptance/continuation record linked above; retain the shared-file protocol and outstanding consumer work.

## Branding requirements clarification — 2026-09-21

Reconcile the seed schema and its tests with [the canonical branding seed requirements](../../../architecture/branding-seed.md). Required identity, locale and time zone, deferred reply-to configuration, optional assets/links, notice validation and standard appearance defaults are approved. Welcome text defaults to “Welcome to {product name}”, application-email sender name to company name, email footer to absent, and date/number formatting to tenant locale with overrides. Null/default-materialization questions remain open. Preserve completed work and existing pins/ownership; this clarification does not itself claim implementation or integrated acceptance. Reconcile the latest main-checkout documentation into the worktree before final schema acceptance; do not overwrite newer requirements during integration.

## Develop audit, 2026-09-21

Integrated and closed at 9f67536; contract-validation fixes at 2f5a09c and child-process environment proof at b61c080 are also ancestors of develop ea4890b. The continuation and remaining-work map are historical execution records. The S0-03 shared-file window is over. Setup foreground derivation (1rd.3.1), explicit-null policy (1rd.3.3) and shared font ownership (tf1) remain separate.

See the [whole-ticket audit](../audit-2026-09-21.md) for evidence and auxiliary dependencies. This update starts no implementation and closes no acceptance gate.
