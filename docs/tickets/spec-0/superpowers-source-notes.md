# Superpowers source notes for independent Spec 0 sessions

Bounded read of the primary source repository: [obra/superpowers](https://github.com/obra/superpowers). The README describes the workflow as approved design → implementation plan → `subagent-driven-development` or `executing-plans`, with `using-git-worktrees` before plan execution and `finishing-a-development-branch` after completion ([README](https://github.com/obra/superpowers/blob/main/README.md)).

## Verified handoff guidance

Launch one independent Claude Code + Superpowers session per already-approved Spec 0 ticket. Before implementation, each session should:

1. Claim exactly one Bead in the shared repository tracker, and record/observe its status there. Do not duplicate or invent tickets. The Bead is the coordination identity; the approved Spec 0 ticket is the scope authority.
2. Use the exact skill `using-git-worktrees` to detect existing isolation, then create or verify one isolated worktree. Its source says to prefer native worktree tools, use a Git fallback only when unavailable, and verify a clean test baseline before implementation ([source](https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md)).
3. Read the approved ticket/spec and use the exact skill `writing-plans` only when a plan is needed. That skill requires exact file paths, test/verification steps, and bite-sized tasks; it saves plans under `docs/superpowers/plans/` by default ([source](https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md)). Do not use it to broaden the approved ticket.
4. Execute the existing approved plan with either exact skill `subagent-driven-development` (fresh implementer and review per task, then whole-branch review) or exact skill `executing-plans` (inline execution plus one whole-branch review). Both require an isolated workspace, a recovery ledger, tests, and explicit handling of review findings ([subagent source](https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md); [executing source](https://raw.githubusercontent.com/obra/superpowers/main/skills/executing-plans/SKILL.md)).
5. Keep each session's worktree and branch independent until integration. If ticket B consumes an interface or file produced by ticket A, record that dependency in the shared Bead/status context and integrate A before B relies on it; do not merge unrelated branches into the dirty baseline.

## Baseline and integration constraints

- Do not assume the dirty baseline is docs-only: verify it immediately before starting. Treat every pre-existing modification as user-owned evidence; do not reset, clean, overwrite, or claim those changes. A session must distinguish its own diff from this baseline before reporting completion.
- Shared Beads claim/status is the project-specific coordination overlay; Superpowers does not define Beads. Use the claimed Bead to prevent two sessions taking the same ticket, and record pending, in-progress, blocked, or complete state with dependency/blocker facts. Do not add new tickets during this bounded execution unless the user separately authorizes scope expansion.
- One worktree per session means local merges can conflict with the dirty main checkout. Integration is a deliberate later step, not an automatic side effect of finishing a ticket. Preserve branches/worktrees when integration has not been authorized.
- At completion, use the exact skill `finishing-a-development-branch`: verify the full test suite, detect whether the workspace is a named worktree, determine the correct base branch, then present the merge / PR / keep-as-is choices. The source explicitly says integration is the human partner's decision and cleanup must not discard uncommitted files ([source](https://raw.githubusercontent.com/obra/superpowers/main/skills/finishing-a-development-branch/SKILL.md)).

## Scope boundary for this handoff

This note records source-grounded operating instructions only. It does not install Superpowers, create worktrees, modify code, create tickets, commit, push, or sync Beads. Exact skill names and URLs above were verified from the repository README and the five requested skill files.
