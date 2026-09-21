# Resume context and migrator acceptance: S0-04

Proposed continuation prompt. Send only after the documentation baseline is integrated and the existing session is resumed or its claim explicitly transferred. Do not execute this file as part of the planning audit.

```text
Complete only context/migrator/placeholder acceptance, genie-ops-center-v2-1rd.4, using the full installed Superpowers workflow.

Main checkout: /home/kenan/work/genie-ops-center-v2
Retained worktree: /home/kenan/work/genie-ops-center-v2.feature-s0-04-context-migrator
Retained branch/head at audit: feature/s0-04-context-migrator / 61b2408
Do not create a replacement implementation or nested worktree.

Read main-checkout AGENTS.md and CLAUDE.md; docs/tickets/spec-0/{README.md,audit-2026-09-21.md,handoffs/README.md}; docs/tickets/spec-0/04-context-migrator-and-placeholder/{index.md,evidence.md}; docs/specs/00-monorepo-foundation.md; docs/tech-plans/00-monorepo-foundation.md; docs/adr/0008-foundation-integration-and-generated-registry.md; and the linked module/environment contracts. The evidence file is on the retained branch. Reconcile the integrated documentation baseline into it without overwriting newer branch evidence or unrelated work.

Run bd prime, bd where --json, bd worktree info and bd show for 1rd.4, 2tc, 1rd.2, 1rd.3 and 5ph (all IDs use prefix genie-ops-center-v2-). Verify the shared database and accepted prerequisite ancestry. 1rd.4 is assigned to codex-ready-queue at audit: do not force a claim or impersonate that actor. If a new session needs ownership, stop for an explicit transfer. Claim the unassigned 2tc prerequisite under your own actor only as part of this authorized lane.

Preserve the reviewed implementation at 61b2408. Scoped code review passed; real Postgres acceptance did not. Docker info returned 29.8.0 during the audit, which is not Testcontainers proof. Verify the existing intended endpoint with disposable Testcontainers/Postgres and record evidence on 2tc. Do not restart host services, change credentials or point tests at a non-disposable database. If access fails, report the exact command/error, leave acceptance blocked and stop that proof. Close 2tc only when disposable database execution actually works.

Complete the ticket's real-DB fresh/rerun, dedicated-session lock/ledger, timeout and cleanup evidence, plus authorized placeholder reads and denial with the unchanged loader. Inspect existing test:integration targets: three router cases do not prove the migrator matrix. Add missing cases test-first and wire nonempty Nx targets. Preserve original errors, redaction and unsafe-client destruction. Keep module factories out of core. S0-05 owns app-composed two-database isolation, page mounting and transport/browser/image proof; S0-07 later broadens multi-process adversarial cases. Do not pull those tickets forward.

Own only core context/environment/logger/errors/migrator, generic core test helpers, placeholder implementation/history/factories, necessary test wiring and scoped evidence. Your existing dependency window is root package.json, core/placeholder package.json and pnpm-lock.yaml; record exact required additional shared test-config paths before editing. 5ph runs independently and may not edit those shared surfaces. Preserve accepted pins, aliases, compatibility bridges and boundary fixes from develop.

Use Superpowers planning only for the remaining bounded work, red/green tests, independent task/whole-change review and repairs. Scoped local commits are authorized. Run applicable uncached Nx lint/typecheck/unit/integration/validate targets, affected build/test/lint/typecheck, formatting and frozen-install checks when dependency files change. Record what actually ran; an absent build or E2E target is not a passed build/E2E test.

Integrate after 5ph is reviewed and integrated. Obtain the human's exclusive integration window, reconcile current develop into this retained branch, resolve shared changes as a union and rerun affected proof on that union. Local integration through wt is authorized in that reserved window. Recheck the integrated revision, record evidence and close 1rd.4 only when all its acceptance passes. Do not close G2 or start S0-05.

Stop on an extra pool/global DB, pooled advisory-lock dispatch, authorization widening, architecture/major-version change or any unavailable mandatory proof. No code push, publication, deployment, host-service changes, live-hook activation or worktree deletion. Report exact commits, commands/results, review disposition, remaining limits and ownership release in Beads and your final response. Keep historical evidence distinct from new runs.
```
