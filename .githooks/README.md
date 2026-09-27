# .githooks

What this folder is for: one dispatcher for each git hook name. Each file runs
the Beads hook of the same name from `.beads/hooks/`, then Lefthook for
`pre-commit`. It exits with the first non-zero status.

What must not go in it: hook logic. A check belongs in `lefthook.yml` or in the
managed Beads hooks, never here.

Activation is a separate integration-owner step. Without per-worktree Git
configuration, `pnpm run hooks:install` changes repository-common configuration
for every linked worktree. Do not run it until each live worktree can resolve the
dispatcher and its local dependencies, or the owner approves another safe
rollout. Merging branches alone does not update existing worktree files.

To roll activation back, run `git config --unset core.hooksPath`. That returns
the repository to stock `.git/hooks`, so neither Beads nor Lefthook runs. Set the
value back to the Beads path only if the owner asks for the pre-repair state.

Lefthook does not recognise a custom `core.hooksPath`. `lefthook.yml` sets
`no_auto_install: true`, so it no longer tries to sync hooks on each run or
prints the warning box that suggested the commands below. If the box ever
returns, the jobs under it still run. Never run `lefthook install --reset-hooks-path`, `lefthook install --force`, or
`lefthook uninstall --unset-all`, and never unset `core.hooksPath` in response to
it. Each of those disables Beads for every worktree at once, because
`core.hooksPath` is repository-common. The `--force` variant also overwrites the
tracked dispatchers in this folder.
