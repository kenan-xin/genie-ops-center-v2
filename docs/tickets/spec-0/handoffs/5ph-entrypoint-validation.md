# Validate data-only module entrypoints: 5ph

Proposed first-batch prompt. Send after the reviewed documentation baseline is integrated into develop. This lane can run beside S0-04 without its runtime dependencies.

```text
Fix only malformed or escaping module entrypoints, genie-ops-center-v2-5ph, using the full installed Superpowers workflow.

Start from /home/kenan/work/genie-ops-center-v2. Read AGENTS.md and CLAUDE.md there, then docs/tickets/spec-0/{README.md,audit-2026-09-21.md,handoffs/README.md}, docs/tickets/spec-0/01-workspace-and-build-inputs/index.md, docs/tickets/spec-0/06-selection-cache-and-build-graph/index.md, approved Spec 0, its technical plan and ADR 0008. This is an independent data-only repair required before G2, not permission to implement S0-06.

Use wt to create one chore/ or bugfix/ branch/worktree from current local develop containing the audited documentation. Verify the base includes accepted S0-01 and later boundary/cache/lint repairs. Run bd prime, bd where --json, bd worktree info and bd show genie-ops-center-v2-5ph. Verify the shared database; atomically claim with a unique session actor. If already assigned or the documentation/prerequisite is missing, stop rather than force a claim.

Inspect tools/generators/src/selection/inventory.ts and resolve.ts and their tests. They currently validate entrypoint presence/existence but can accept malformed values, directories or paths escaping the owning module. Add failing cases first, then the smallest validation that rejects empty/non-string paths, missing or non-file targets and package escapes. Include absolute and traversal spellings and symlink escape coverage where supported. Keep valid in-package entrypoints working. Discovery must remain data-only: do not import/evaluate executable module declarations, app/core runtime or drivers. Preserve inventory ID/name/root rules, explicit empty versus unset and ordered selection.

Own only tools/generators/src/selection implementation/tests and scoped README/evidence. Do not edit manifests, lockfile, nx.json, shared presets, app code, Storybook host or S0-04 source. S0-04 owns the current dependency/configuration window. If a public selection type or consumer contract must change, stop and coordinate rather than expand this patch silently.

Use Superpowers bounded planning, TDD, independent review and repairs. Scoped local commits are authorized. Run applicable uncached @genie/generators lint/typecheck/test and workspace validation through Nx, affected build/test/lint/typecheck and formatting. Prove the malformed fixtures fail before the repair, valid fixtures pass, and throwing-module discovery still never evaluates the module. Clean only exact temporary paths created by the tests, never repository directories.

This lane integrates before S0-04. Obtain the human's exclusive integration window, update from develop, rerun affected gates and integrate locally through wt. Record the integrated revision and checks before closing 5ph. A reviewed branch without integration stays open. Do not reopen S0-01 or claim S0-05/S0-06.

Preserve accepted dependency pins/aliases/bridges, naming and tenant-module visibility. No code push, publication, deployment, host-service change, live-hook activation or worktree deletion. Report changed paths, red/green evidence, exact commands/results, review disposition and remaining limits in Beads and your final response.
```
