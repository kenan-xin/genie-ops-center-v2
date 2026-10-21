# S0-03 remaining work and acceptance map

Historical execution record: S0-03 was integrated and closed at `9f67536`; see the [current audit](../audit-2026-09-21.md). Earlier pauses, remaining-task lists and exclusive writer windows below are not current dispatch instructions.

Companion to the [delivered continuation authority](continuation.md). This map preserves Task 6–11 numbering used by the existing session without requiring its scratch plan. The [ticket](index.md), [Spec 0](../../../specs/00-monorepo-foundation.md), [module contract](../../../architecture/module-contract.md) and [branding requirements](../../../architecture/branding-seed.md) govern exact behavior. Check source and Beads before repeating work; reported completion is not integrated acceptance.

| Task | Required result | Meaningful proof |
| --- | --- | --- |
| 6 — Contracts directory | Real core contracts entrypoint and export; preserve app/module import boundaries and singular naming | Export exists atomically; contract files are included in lint/typecheck/test while testing/story fixtures remain appropriately excluded; negative controls prove collection |
| 7 — TenantContext type | Build-safe context and deployment-environment types, using the approved library types | Type-level positive/negative cases; importing types never creates runtime services |
| 8 — Tenant configuration | Strict tenant.yaml and authored branding schemas following current approved requirements | Reject unknown/wrong-file keys; invite/jit; exclude derived/bookkeeping values and stripped editor metadata; test approved required fields, omission/default behavior and email/URL validation |
| 9 — Module declaration | All seventeen points and final Module type, including category/settings metadata, event/job/capability/inbound/default-role declarations | Compile-time examples prove accepted and invalid declarations; no later-section runtime service implementation |
| 10 — Runtime contract validation | Canonical kebab-case IDs and declaration validation | Independent valid/invalid fixtures; preserve stable permission and module identity; no silent coercion that weakens the contract |
| 11 — Build safety | Static and fresh-process evidence for the public contracts | Deployment variables absent; independent driver-import and connection/service-initialization negative controls; probe restoration verified |

Tasks 7/8 were reported implemented and reviewed on the older branch baseline (74 tests after branding-format corrections). That report does not establish acceptance on Vitest 4.1.11 or compliance with later approved seed defaults. Preserve the work, reconcile with accepted develop and verify the resulting union.

Phase A authorization/CSP/coverage work remains part of final branch review. The dependency slice alone was accepted earlier; it did not accept Phase A/B source. Retain request-owned lazy authorization with only `placeholder:read` granted, and do not pull factory/runtime wiring, real identity, setup, worker or lifecycle implementation into this ticket.

After implementation, review the whole branch against the canonical contract, run the integrated checks specified in the continuation, and close only satisfied work. Future setup foreground derivation, broader selection/confidentiality proof and genuine unresolved product choices remain separate.
