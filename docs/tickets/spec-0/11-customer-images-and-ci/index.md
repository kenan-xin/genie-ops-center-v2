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

## Implementation record, 2026-09-23

Approach and tradeoffs: [design.md](design.md). Commands, outcomes and blocked items:
[evidence.md](evidence.md). Beads owns status; the acceptance gate is not closed here.

Two scope notes recorded explicitly:

- **AC-1 carry from S0-06.** The S0-06 evidence transferred the config/schema
  final-integration obligation of AC-1 to this ticket. It is carried here: the `validate`
  suite pins that a change to the shared config preset and to the exposed core
  tenant-config schema each mark their consumers affected, and the pull-request gate runs
  `validate` on every change.
- **Real image proof ran; real publication did not.** After the user started Docker, the
  customer image matrix (development, selected and explicitly-empty selections), the release
  smoke against the immutable candidate identity, and the app/core/module/Storybook
  integration and phone/desktop browser suites all passed on Docker 29.8.0. Publication was
  exercised only at the safe local-sink boundary. Real GHCR authentication and push remain
  separately authorized and were not performed; the registry tag/push residual is
  `genie-ops-center-v2-3aa` (first real release).

## Build-input exclusion (pg4), 2026-09-23

Owner decision in Bead `genie-ops-center-v2-pg4`, recorded in Spec 0 AC-24 and DEC-33. It supersedes every earlier instruction in this ticket to find excluded module code by needles in built chunks.

- The Docker context stays the repository root. In the builder stage, before `pnpm install` and `next build`, a step resolves the `MODULE_INCLUDE` selection with the dependency-free resolver in `tools/generators/src/selection` and removes every `packages/modules/<folder>` not in it.
- The same step then checks that the remaining `packages/modules/` folders equal the selection and fails the build otherwise. Install failure is not the check, because a frozen install passes and leaves a dangling link when a listed module folder is missing.
- The prune refuses to run when `MODULE_INCLUDE` is unset, so it never removes every module silently. The Dockerfile's `ENV MODULE_INCLUDE=${MODULE_INCLUDE}` turns unset into empty today, so keep the two distinct, for example by testing `${MODULE_INCLUDE+set}` in the build step without that `ENV` copy. Every image builder passes the argument: the release wrapper (its development fallback spells every module id), `build-fixture-image.ts`, the `build-image` target and the image tests. R-3a's unset default applies to host builds.
- A module package is a folder under `packages/modules/`. Fixture templates elsewhere (`apps/genie/tools/fixture-modules`, generator `__fixtures__`) are out of scope. The `apps/genie/tools/fixture-modules` templates enter every builder stage with `COPY apps/genie`. A relative import of them into application code is a residual the prune does not catch.
- The AC-25 fixture image must still build although the prune removes `placeholder`. This is unproven until it passes inside `docker build`.
- The app keeps `@genie/module-placeholder` as a fixed workspace dependency in `apps/genie/package.json`, so a pruned module's link dangles by design. The explicitly empty selection and the AC-25 fixture image prune `placeholder` itself and prove this under install and the Nx project graph. Until they pass inside `docker build`, the pg4 risk about fixed module dependencies stays open.
- The builder stage is discarded. The runtime stage copies `.next/standalone`, `.next/static`, `apps/genie/public` and `deploy/entrypoint.sh`. That no `packages/modules/` source reaches it rests on Next's output tracing and that copy list, and the image-filesystem scan (`excludedModulePathNeedles`) checks it.
- The prune step prints the kept and removed folders in the build log, and the tests assert on that log. This is how AC-5 observes the discarded builder stage.
- The tests run in a staged copy, as `build-fixture-image.ts` does, with at least one extra fixture module under `packages/modules/`, so the log lists a removed folder and each test can fail. They prove that a direct import of an excluded module, including a subpath import, fails the build, that a control without the import passes, that the check fails when an unselected folder remains, and that an unset argument fails the build.
- In `apps/genie/testing/image-scan.ts`, only the route-string needles `"/m/<id>"` and `"/admin/m/<id>"` leave `excludedModuleContentNeedles`. `excludedModulePathNeedles` and the `__drizzle_migrations_<id>` ledger needle stay, so the `migration-file` rule (AC-17) keeps its input. A unit case proves that excluded-module SQL under `node_modules/@genie/module-<id>/` still yields `migration-file`. `devToolingNeedles` (AC-28), the secret checks and the `MODULE_INCLUDE`-only build-argument check (R-32) stay.
- This ticket's `design.md` on the S0-11 branch still presents the excluded-module needle scan as the exclusion proof. Reconcile it in `genie-ops-center-v2-1rd.11.1` with a dated note.
- The smoke test keeps its excluded route, table and migration-history checks. No bundler migration is part of this ticket.
