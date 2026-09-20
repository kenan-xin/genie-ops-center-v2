# Storybook component-test stability characterization

Ticket: `genie-ops-center-v2-j16`. Baseline `c87591f`, pinned Nx 23.2.1 and Vitest 4.1.11. Recorded 2026-09-21 in a dedicated worktree; no source/configuration changes.

The previous intermittent Nx flaky label did not reproduce in ten consecutive uncached runs. Each executed all 11 browser tests in three files and passed, with no flaky label. This characterizes the observation; it does not prove that all environments are free of flakes or establish a historical root cause.

## Procedure

Create an isolated worktree from the accepted develop revision with `wt switch --create <branch> --base develop --no-hooks`; install with `pnpm install --frozen-lockfile --ignore-scripts`. Run ten times sequentially:

```sh
NX_DAEMON=false pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache --output-style=static
```

No Storybook dev server or second task runner used this worktree during the probe. Other repository worktrees were active; this is not a claim of an otherwise idle host. Each worktree has its own Nx metadata. Do not reset another session's cache or run history.

| Run | Exit | Wall seconds |
| --- | --- | --- |
| 1 | 0 | 3.06 |
| 2 | 0 | 2.67 |
| 3 | 0 | 2.74 |
| 4 | 0 | 2.71 |
| 5 | 0 | 2.69 |
| 6 | 0 | 2.72 |
| 7 | 0 | 2.63 |
| 8 | 0 | 2.67 |
| 9 | 0 | 2.61 |
| 10 | 0 | 2.65 |

A further uncached run after `NX_DAEMON=false pnpm exec nx reset --onlyWorkspaceData` in this isolated worktree passed all 11 tests without the label. That reset cleared only this worktree's local metadata; it neither changed another worktree's historical run data nor fixed a demonstrated application defect.

The earlier pre-rename failure and competing dev-process explanations remain hypotheses. If the label recurs, preserve that worktree's logs, exact input hash, process ownership and failing assertion before resetting metadata; characterize failure before changing test timing or retries. No retries, timeouts, dependency pins, cache inputs or assertions were weakened.
