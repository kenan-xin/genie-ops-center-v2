# Storybook component-test stability, bound run

Ticket: `genie-ops-center-v2-j16`. This file records eleven runs that are bound to a revision and to a clean worktree state. It replaces the unbound record in [the first characterization](j16-storybook-stability.md), which stays for history.

Run date 2026-09-21. Worktree `/home/kenan/work/genie-ops-center-v2.test-j16-storybook-stability`, branch `test/j16-storybook-stability`.

## Revision and worktree state

Both manifests were taken in the same worktree, the first before run 1 and the second after run 11.

| Field | Before, 02:49:34 +08:00 | After, 02:50:06 +08:00 |
| --- | --- | --- |
| `git rev-parse HEAD` | `bd4b45b803be556c2f1a12d3d5f5f72387897935` | `bd4b45b803be556c2f1a12d3d5f5f72387897935` |
| `git status --porcelain` | empty, 0 lines | empty, 0 lines |
| `git ls-files -s \| sha256sum` | `f01865f9c9d51793c5000e0be232b6fbf29df8a5ea1a6d39f1c45ef6987eb3cb` | `f01865f9c9d51793c5000e0be232b6fbf29df8a5ea1a6d39f1c45ef6987eb3cb` |
| `git ls-files -z \| xargs -0 sha256sum \| sort \| sha256sum` | `f89cb85e578e3855233d43ae190136b3fa8f30e93cbc090a3f0bda67c2f6000f` | `f89cb85e578e3855233d43ae190136b3fa8f30e93cbc090a3f0bda67c2f6000f` |
| Tracked files | 796 | 796 |

The second manifest equals the first, so no tracked file changed during the eleven runs.

`bd4b45b` is one documentation commit over `c87591f`. `git diff --stat c87591f bd4b45b` reports one changed file, `docs/tickets/followups/j16-storybook-stability.md`, 32 insertions. The source and the configuration of the two revisions are identical, so this run tests the `c87591f` source tree.

Versions from `package.json` at this revision: `nx` 23.2.1, `vitest` 4.1.11, `@vitest/browser` 4.1.11, `@vitest/browser-playwright` 4.1.11.

## Commands

Each of the eleven runs used one command, from the worktree root:

```sh
NX_DAEMON=false pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache --output-style=static
```

Between run 10 and run 11, one reset command:

```sh
NX_DAEMON=false pnpm exec nx reset --onlyWorkspaceData
```

It exited 0 and printed `Resetting: - Workspace data directory`, then `Successfully reset the Nx workspace`. `--onlyWorkspaceData` limits the reset to this worktree's Nx metadata directory. No global cache was cleared and no other worktree was touched.

## Results

Every run printed `Test Files 3 passed (3)`, `Tests 11 passed (11)` and `Cache: Skipped (--skip-nx-cache)`. No log contains the string `flaky`, in any case.

| Run | Exit | Wall seconds | Tests | Cache |
| --- | --- | --- | --- | --- |
| 1 | 0 | 3.37 | 11 passed | Skipped |
| 2 | 0 | 2.65 | 11 passed | Skipped |
| 3 | 0 | 2.79 | 11 passed | Skipped |
| 4 | 0 | 2.89 | 11 passed | Skipped |
| 5 | 0 | 2.84 | 11 passed | Skipped |
| 6 | 0 | 2.84 | 11 passed | Skipped |
| 7 | 0 | 2.84 | 11 passed | Skipped |
| 8 | 0 | 2.76 | 11 passed | Skipped |
| 9 | 0 | 2.82 | 11 passed | Skipped |
| 10 | 0 | 2.81 | 11 passed | Skipped |
| reset | 0 | — | — | — |
| 11 | 0 | 2.86 | 11 passed | Skipped |

## Limits of this record

The runs prove one revision, on one host, on one date. They do not prove that no environment produces a flaky label, and they do not identify a historical root cause. Other worktrees were active on the host, so this is not an idle-machine measurement.

The raw logs were written to a temporary directory and are not committed. The manifests, the commands and the per-run numbers above are the record. Anyone can repeat the procedure at this revision, because the revision and the clean state are named.
