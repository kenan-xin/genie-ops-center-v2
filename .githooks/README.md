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
