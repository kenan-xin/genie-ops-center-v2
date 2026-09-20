# Module configuration sibling restriction proof

Ticket: `genie-ops-center-v2-6bv`. Recorded 2026-09-21 on source revision
`a7cf8a1`, in a dedicated worktree with a clean tracked baseline.

The existing test “still bans a sibling module from a module package
configuration file” independently depends on the module-config override's
`siblingModulesAtDepth(0)` entry. No new test or production change is needed.

From `packages/config`, run:

```sh
pnpm exec vitest run --config vitest.config.ts src/oxlint/boundaries.test.ts -t 'still bans a sibling module from a module package configuration file'
```

| State | Exit | Result |
| --- | --- | --- |
| Unchanged source | 0 | 1 passed, 101 skipped |
| Replace the sole `[...MODULE_LAYER, siblingModulesAtDepth(0)]` with `[...MODULE_LAYER]` | 1 | 1 failed, 101 skipped |
| Restore original bytes | 0 | 1 passed, 101 skipped |

The mutation fails at boundaries.test.ts:919: `expect(result.failed).toBe(true)`
received false. Removing the restriction therefore allows the forbidden import;
this is an assertion failure, not a discovery or process-startup failure.

The boundary source was restored in a Python finally block and its bytes checked.
Before/after SHA256:
`915f338904f6be215a9a9f69cf510eab88b7b406e9fc3f52e349c9081b0ef1a3`.
The worktree was clean after the proof, before writing this document.
A frozen install with scripts disabled passed before the run.

This is new mutation evidence, not a reconstruction of the original implementation's
RED history. S0-03-owned production files and its working directory were untouched.
