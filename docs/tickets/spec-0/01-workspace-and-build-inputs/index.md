# S0-01 — Establish workspace, import boundaries and data-only build inputs

Accepted integration is recorded in [integrated-acceptance.md](integrated-acceptance.md). Consult Beads for current status; earlier planning holds below do not reopen satisfied gates.

Bead: `genie-ops-center-v2-1rd.1`. Status and claims live in Beads, not this document.

## Governing context

Read [Spec 0](../../../specs/00-monorepo-foundation.md), [technical plan](../../../tech-plans/00-monorepo-foundation.md), [ADR 0008](../../../adr/0008-foundation-integration-and-generated-registry.md), [execution contract](../README.md), repository AGENTS.md/CLAUDE.md, and applicable canonical contracts before editing. Follow the linked specification for exact requirements; this ticket does not weaken them.

Traceability: R-1–R-10, R-3a, R-5a/R-5b, R-7a, R-19a; AC-1/AC-2/AC-2a; ADR 0008 and plan Build ownership.

## Dependencies and worktree ownership

Hard prerequisites: none within Spec 0; approved planning baseline must first be available in the integration branch.

Start only after prerequisites are integrated, validated and closed in the shared Beads database. Create one branch/worktree from that integrated baseline and atomically claim this bead; a sibling worktree finishing code is not sufficient.

Owned surface: Root manifests/lockfile, nx.json, packages/config, workspace skeletons, tools/generators selection resolver only, repository hygiene checks.

Parallel eligibility is in the [wave/dependency map](../README.md). Root lockfile/manifests/Nx configuration and shared exports require the documented single-writer handoff even between logically independent tickets. Do not change another ticket's interfaces silently.

## Scope

- Create the pnpm/Nx workspace and six architectural classifications; shared TypeScript, Oxlint, Oxfmt, Tailwind and unit-Vitest presets, staged hooks, folder READMEs and root Nx-backed scripts. Reserve only a build-safe shared Storybook configuration extension point; do not implement its preset or targets here.
- Pin the non-Storybook foundation toolchain after checking current official compatibility. S0-02 exclusively owns actual Storybook/framework/addon pins, its shared preset implementation and associated lockfile/Nx/config changes. Vendor the reviewed anti-slop revision/license/local policy; exact compatible oxlint/plugins pins, no Effect rules or experimental Nx bridge.
- Implement the shared build-safe, data-only module selection resolver required by both app and Storybook. Preserve ordered selection, unset versus explicit empty, inventory identity/path metadata and pre-Nx serialized input/fingerprint. Do not import module declarations or initialize services. App-owned registry generation remains S0-05.
- Set local cache on, remote cache off. Establish planned target names and deterministic inputs; later tickets complete consumer graph and matrix proof. Provide strict build-safe tenant-schema entrypoint locations for S0-03, not duplicated schema definitions.

## Acceptance and tests

- Positive/negative architectural import fixtures include executable tests, package subpaths and cross-package relative spellings; config cannot import internal projects; tooling cannot import app/module/runtime/database implementations.
- A module fixture that throws on evaluation is never evaluated during selection. Unknown/duplicate inventory ids and missing entrypoint paths fail. Explicit empty and unset differ; supplied order survives.
- Prove shared lint, anti-slop rule failures, staged hooks and formatter convergence. Affected graph includes config dependencies and correct tags; local cache reuses identical pure work. Run nonempty unit collection.

Use TDD in behavioral slices. UI requires documented stories and meaningful failing component assertions before app use; unit, real-database integration and deployed E2E remain separate. Never claim a planned or empty command passed.

## Exclusions

No production bootstrap, module registry runtime, feature UI, database tables, customer build publication or Storybook acceptance claim.

All tickets exclude Sections 1–5 runtime features, design imports, unresolved later product decisions, remote cache, strict script/style nonces and unapproved infrastructure expansion unless explicitly named in the approved Spec 0 scope.

## Gate and stop conditions

Foundation prerequisite. Dependency changes incompatible with canonical majors require approval, not silent substitutions.

Also stop on major dependency/architecture changes, new services, extra tenant pools, forbidden imports, authorization weakening, retained-data deletion or customer artifact exposure. Report exact failed command, versions, observed evidence and smallest alternatives; keep this bead open and notify the integration owner.

## Completion handoff

Report changed paths, commands and real outcomes, red/green evidence, unverified checks, prerequisite revision and proposed integration action in the bead. Use explicit ticket-specific authority for commits and local integration; do not request an already-granted action again. Routine Beads sync is allowed. Code push/publication and hook activation still require explicit authority. If review-ready but not integrated, keep the bead open/in progress with that note. Only the authorized integration owner, including a delegated implementer where explicitly granted, closes it after required evidence and integrated-revision checks pass. Preserve any gate failures as blockers; do not release dependent work early.

## Naming revision, 2026-09-20

Follow [the module naming revision](../../../tech-plans/module-naming-revision.md) and its canonical layout reference. Proposed rework: shared naming validation, inventory and singular boundary coverage; fixture reconciliation and a fresh delta review. Prior repair approval does not cover this change. This addendum supersedes older naming/path instructions in implementation plans, without rewriting their historical evidence. The sequence was subsequently authorized. Follow the current acceptance/continuation record linked above; retain the shared-file protocol and outstanding consumer work.

## Follow-up evidence, 2026-09-21

[Generator entrypoint resolution](generator-entrypoint-resolution.md) replaces the weak `exports`-revert negative control with a disposable fixture that carries both a valid legacy `main` and an `exports` map. It proves the exports map alone decides resolution, that a broken exports target does not fall back to a valid `main`, and that the real consumer specifier resolves from `apps/storybook`. Bead `genie-ops-center-v2-vqi`, strengthening `genie-ops-center-v2-div`.
## Root test gate guard, 2026-09-21

[Root test gate guard](root-test-gate-guard.md) adds a `tools/generators` unit test that runs the root `test` script against a stub `nx` and fails when the `run-many` target list no longer carries `validate`. It makes the `validate` target added by `38c7a3e` non-deletable without a failing check, and it stays outside the validate collection so deleting the target cannot hide its own guard. The generators `test` target also takes the root manifest as a project-local input, so a warm Nx cache cannot replay past the mutation. No root `package.json`, `nx.json`, lockfile or product change. Bead `genie-ops-center-v2-3o6`.

[Anchor cleanup guard](anchor-cleanup-guard.md) proves the isolated-root helper's per-anchor recursive removal. A disposable `pnpm` replaces one anchor symlink with a real directory that holds a file; the helper must remove it recursively and leave the checkout target untouched. Bead `genie-ops-center-v2-1rd.1.3`.

## Validate cache ignore inputs, 2026-09-21

[Validate cache inputs and ignore files](validate-ignore-inputs.md) adds the workspace's `.gitignore` and `.nxignore` files, at the root and nested, to the `validate` target's declared inputs. A nested ignore file changes which directories Nx treats as projects, and without the input a warm cache replayed the pass. Bead `genie-ops-center-v2-0d2`.

## Historical implementation plan

The superseded `plan.md` was removed from the active documentation to avoid executing stale instructions. Its exact contents remain in Git at `4f0dbac:docs/tickets/spec-0/01-workspace-and-build-inputs/plan.md`. Use this ticket, its linked current contracts and the owning agent's current correction handoff for further work. Historical evidence and active adoption artifacts are retained.
