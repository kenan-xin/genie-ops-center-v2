# S0-03 continuation through reviewed local integration

Historical execution record: S0-03 was integrated and closed at `9f67536`; see the [current audit](../audit-2026-09-21.md). Earlier pauses, remaining-task lists and exclusive writer windows below are not current dispatch instructions.

Authorized and delivered by the owner to the existing S0-03 implementation session on 2026-09-21. This repository copy replaces the external handoff as the readable execution contract. It is authority to proceed, not proof of completion or confirmation that the writer transfer has been recorded. Live status and effective writer records remain in Beads.

The later approved [branding seed requirements](../../../architecture/branding-seed.md) govern required fields, omission and text/format defaults. Unresolved null/materialization questions remain explicit. Preserve this documentation reconciliation when integrating; do not replace newer main-checkout requirements with older branch documents.

Continue S0-03 through reviewed local integration using your existing Superpowers session and workflow.

WORKSPACE AND AUTHORITY
Work in the existing S0-03 worktree on feature/s0-03-module-contracts. The integration checkout is the main checkout, branch develop; its accepted baseline is ae00f6b. Preserve every existing tracked/untracked change, including Tasks 7/8, field-table evidence and documentation corrections. Do not repeat completed design or implementation stages.

This authorization supersedes this ticket's earlier no-commit/no-merge/no-sync restrictions and the Tasks-7/8-only pause. You may make scoped feature-branch commits, reconcile with accepted develop, implement the remaining Tasks 6–11, correct associated documentation, run reviews and acceptance checks, merge locally into develop and close satisfied S0-03 acceptance work. Beads updates and Dolt sync are allowed. Git code pushes, remote PR publication, deployment and hook activation are not authorized. Do not disable persistent hooks; use command-local core.hooksPath=/dev/null for Git mutations to keep this run's hook behavior explicit.

Use the current instructions in AGENTS.md and CLAUDE.md in the main checkout. Native pnpm/Nx/Git/bd commands must work without RTK or wt; personal wrappers are optional. Reuse this worktree, not a nested one. Existing owners remain unless explicitly transferred below.

READ THE EXISTING CONTRACT
Read these documents in your worktree:
- docs/tickets/spec-0/03-module-contracts-and-build-safe-schemas/index.md
- docs/tickets/spec-0/03-module-contracts-and-build-safe-schemas/remaining-work.md, plus the existing session plan where it remains consistent
- docs/tickets/spec-0/02-storybook-compatibility-g1/integrated-acceptance.md, prerequisite dependency handoff section
- docs/specs/00-monorepo-foundation.md
- docs/tech-plans/00-monorepo-foundation.md
- docs/architecture/module-contract.md
- docs/flows/tenant-module-visibility.md
- docs/architecture/branding-seed.md (later approved required fields and defaults supersede earlier field-table assumptions)
Also read docs/tickets/spec-0/02-storybook-compatibility-g1/integrated-acceptance.md and live Beads records for S0-03 (genie-ops-center-v2-1rd.3), S0-02 (genie-ops-center-v2-1rd.2), dependency ownership handoff (genie-ops-center-v2-lbt), branding derivation (genie-ops-center-v2-1rd.3.1), branding formats (genie-ops-center-v2-1rd.3.2), kebab-case validation (genie-ops-center-v2-1rd.1.5), and core browser/server type isolation (genie-ops-center-v2-owz).

The existing branch plan is optional implementation guidance, not an external prerequisite. The repository remaining-work map and canonical requirements define the required results. Settled canonical requirements and this explicit authorization govern where historical plan examples disagree. Correct local mistakes, record the ruling and continue; escalate only a genuinely unresolved product/architecture choice, incompatible pin, or conflicting active writer.

BRANDING DECISION
Complete the agreed Tasks 7/8 corrections:
- Branding seed input contains seedable fields, excluding bookkeeping and derived primary_foreground. Reject authored primary_foreground. Setup will derive/store it using the same shared rule as branding saves; consumers read the stored value. Do not implement setup, persistence, or later-section branding services in this ticket.
- Keep that future setup obligation tracked under the proper future implementation owner. Do not close 1rd.3.1 as implemented merely because the Section 0 schema/docs are corrected; separate any completed clarification from outstanding runtime work without adding a cycle blocking S0-03 on future sections.
- Clarify DEC-35 and corresponding active docs. The file may carry $schema editor metadata; the loader strips it before the strict data schema parses. Define/test the boundary coherently and preserve the future generated editor-schema requirement, without implementing the S0-08 generator here.
- Use product_name and onboarding_mode invite/jit. Validate email_reply_to/support_email as email addresses and support_url/terms_url/privacy_url as HTTP(S) URLs when present, preserving accepted omission/null semantics. Document these requirements and meaningful rejection tests.
- A database column list alone does not establish requiredness, nullability or defaults. Finish the field table with explicit evidence, and raise only genuinely unresolved choices; do not invent tenant-facing defaults or reject intentionally empty values without a contract.

EXPLICIT SHARED-FILE TRANSFER
S0-02's adoption window is complete. For this S0-03 completion window, you are the sole implementation writer of these seven surfaces, limited to S0-03 requirements:
package.json; pnpm-workspace.yaml; nx.json; packages/core/package.json; packages/core/tsconfig.json; packages/config/src/vitest/unit.ts; pnpm-lock.yaml.

You also own necessary S0-03 deltas in packages/config/src/vitest/unit.test.ts, packages/config/src/oxlint/boundaries.ts and boundaries.test.ts, plus narrowly required core browser/server tsconfig files and tests. This does not grant unrelated Storybook changes or permit another simultaneous writer.

Before the first shared-file write, append the effective transfer, this authorization, baseline ae00f6b, paths and writer to S0-03, S0-02 and lbt. Keep the closed S0-02/lbt records closed. Transfer responsibility for the core type-isolation follow-up (owz) from its recorded S0-02 owner to the existing S0-03 implementer with a guarded update; inspect its trigger and implement only if applicable to the resulting core surface, otherwise retain it explicitly deferred with evidence. Do not blindly split configurations or silently allow browser globals in server code.

If current records reveal another active shared-file writer, resolve that collision with the integration owner before overlapping edits; continue disjoint work. Semantic conflicts or incompatible requirements go to the integration owner. Routine conflict resolution that preserves both accepted requirements is yours to complete. No whole-side replacement of manifests/lockfile/configuration.

BASELINE RECONCILIATION
Inventory and preserve current uncommitted work; make scoped checkpoint commits or a verified recoverable snapshot before merging develop. Commit only your owned work; no blanket staging of unrelated changes. Merge ae00f6b (or a verified later accepted develop with understood deltas) into this feature branch. Preserve S0-03 contract/testing coverage and lint scope together with S0-02's Storybook/browser configuration. Restore the adopted Vitest 4.1.11 baseline, not this branch's historical Vitest 5 pin. Regenerate the lockfile only from reconciled manifests and prove frozen installation.

Preserve five S0-03 dependency pins, React family19.3.0, Storybook10.6.0, Nx23.2.1, native tsc7.0.2, TS6 API wrapper6.0.2 resolving6.0.3, tsconfck-local TypeScript5.9.3, compatibility-only ESLint10.11.0, strict peers/release-age policy, the single story test runner, ^default story dependency inputs, MODULE_INCLUDE and production exclusions. Oxlint remains the executed linter. No upgrade or scope expansion is implicitly authorized.

COMPLETE PHASE B
Finish Tasks 6–11, preserving completed Tasks 7/8. Deliver the contract-only directory, TenantContext types, strict schemas, all17 declaration points, runtime contract validators including canonical kebab-case IDs, and static plus fresh-process build-safety proof. Use actual approved library types, not temporary structural stand-ins. Add ./contracts export only with its real implementation. Prove top-level contracts participate in lint/typecheck/tests and that testing/story fixtures retain correct separation.

Keep request-owned lazy authorization and placeholder:read-only stub behavior. No factory/runtime wiring, real identity/entitlements, settings services, worker/lifecycle implementation or deployment expansion. Preserve packages/modules/<id> with @genie/module-<id>, stable IDs, metadata-only discovery and the canonical tenant-module visibility story. Do not rewrite S0-01 naming validation or weaken defensive boundary patterns. Build-safety checks require meaningful independent negative controls for driver imports and connection/service initialization with deployment variables absent.

EXECUTION AND REVIEW
Use the already approved plan with bounded corrections, Superpowers TDD, and verification-before-completion. Continue ordinary implementation/test fixes without asking for permission at each step. Use the execution workflow supported by your installed Superpowers version; do not silently upgrade it or layer a second coordinator review process over it.

Obtain one independent final whole-branch review against canonical requirements, corrected plan and actual source. Disclose review range and subsequent changes. Resolve genuine blocking findings, verify fixes and track deferred valid findings in Beads. Request scoped re-review when a fix changes architectural/security behavior or introduces an uncovered material concern; do not restart whole-branch review for every comment or documentation correction. Report required limitations honestly.

LOCAL INTEGRATION AND CLOSURE
Use finishing-a-development-branch; option 'merge back locally into develop' is explicitly preselected by this authorization. No separate permission is needed for scoped commits or that local merge after review and gates pass.

Serialize integration: verify no other session is currently writing/merging develop, preserve unrelated dirty files and never stash another session's work blindly. If develop moved, reconcile and test the actual union before completion. Run applicable Nx lint/typecheck/test/validate and Storybook build/component gates plus formatting, frozen-install and build-safety/coverage proofs. Re-run relevant cache/selection checks if their inputs or mechanisms changed. Report an empty ordinary build selection as no task, not build proof. Fix regressions introduced by this ticket within its authorized scope.

After local merge, verify the integrated revision, applicable gates and clean probe restoration. Close S0-03 and only follow-ups whose full acceptance is satisfied. Keep future setup derivation, broader S0-10 proof, naming aggregate and other unresolved work open with correct ownership/dependencies. Do not close unrelated beads or launch S0-04. If integrated checks fail, leave acceptance open, preserve branch/worktree, and diagnose rather than force closure.

Keep canonical corrections and durable evidence in docs/tickets/spec-0/03-module-contracts-and-build-safe-schemas/ with pointers to raw evidence as needed. Update Beads with exact integrated revision, tests, review disposition and remaining limitations. Preserve historical evidence. Retain this externally managed worktree and its untracked evidence; cleanup is not required for acceptance.

Finish with one concise handoff: integrated revision, delivered scope, gates/review, closed versus remaining beads and any decision that still needs the owner. No Git code push, deployment, unrelated hook activation or automatic release of another ticket.
