# Core boundary fixture deduplication

Ticket `genie-ops-center-v2-m74`, baseline `7890530`, 2026-09-21.
Removed the two `packages/core/testing/__boundary__.test.ts` cases for config
and generator imports. Their `packages/core/src/__boundary__.test.ts`
counterparts exercise the same `packages/core/**` override and messages.
The root-level generator-import test remains, as do the separate contracts
and tenant-schema rules and all module depth/import syntax regressions.

The retained root-level generator and two src-test cases all fail when the
core-wide override's restriction list is replaced with an empty list
(3 failed, 119 skipped). Restoring the source bytes makes all three pass.
The mutation ran in the dedicated worktree and was restored in a finally block;
no production rule changed.

Uncached Nx config lint/typecheck/test and root format:check passed after the
deletion. This removes duplicate coverage, not an architectural restriction.
