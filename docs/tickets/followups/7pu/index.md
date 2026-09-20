# 7pu: preserved proof of the hook dispatchers

Bead: `genie-ops-center-v2-7pu`, a follow-up of S0-01. The earlier record of the hook behavior lived in a disposable clone that was deleted, so the claim could not be re-checked. This folder replaces that gap with a script anyone can run again, plus the transcript of one run.

Proof script: [`scripts/prove-hooks.sh`](../../../../scripts/prove-hooks.sh). Transcript of the run below: [`transcript.txt`](transcript.txt).

```bash
sh scripts/prove-hooks.sh
```

## What the run covered

Run date 2026-09-21. Repository head `1fa6176` on branch `test/7pu-hook-proof`. Lefthook `2.1.14`, taken from `LEFTHOOK_BIN`, then `node_modules/.bin/lefthook`, then `PATH`. The script makes that path absolute and compares the binary's reported version with the `lefthook` pin it reads from `package.json`. Any other version stops the run, so the recorded version is the version that ran. The script printed `all cases passed`.

The script builds a throwaway Git repository under the temporary directory, copies the tracked dispatchers from `.githooks/`, and deletes the directory when it exits.

No hook of the caller's machine can run, the seed commit included. Every Git command runs with `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointing at files the script writes, with an empty template directory, and the throwaway repository sets its own `core.hooksPath` to an empty folder before the seed commit. The temporary global file names a sentinel hooks directory on purpose. Case 0a shows the sentinel firing in a second throwaway repository that has no guard, then deletes the marker. Case 0b and case 7 show that the proof repository never fires it. Both controls are in the script, so the transcript proves the absence is real and not vacuous.

| Case | What it does | Result |
| --- | --- | --- |
| 0a | Seeds a second throwaway repository under the same sentinel configuration, without the local hooks guard | The sentinel ran, which is what makes case 0b meaningful |
| 0b | Seeds the proof repository, which sets its own empty hooks folder first | The sentinel did not run and the seed commit produced no hook output |
| 1 | Sets `core.hooksPath` to `.githooks` in the throwaway repository, the same command as `pnpm run hooks:install` | `core.hooksPath` reads back as `.githooks` |
| 2 | Commits one file | Order recorded: Beads `pre-commit`, then the Lefthook job, then Beads `prepare-commit-msg`. The commit was written |
| 3 | Removes `.beads/hooks/pre-commit`, then commits | Exit status 1, message `hook dispatcher: ... is missing or not executable`, no commit written |
| 4 | Runs the `post-merge` dispatcher directly | The Beads hook ran and Lefthook did not, which proves the `pre-commit` guard |
| 5 | Removes `node_modules/.bin/lefthook`, then commits | Exit status 1, the message names `pnpm install --frozen-lockfile`, no commit written |
| 6 | Points the throwaway `lefthook.yml` at a job that exits 1, then commits | Exit status 1, no commit written |
| 7 | Checks the sentinel again after every other case | The sentinel never ran |
| 8 | Runs the script again with `LEFTHOOK_BIN` pointing at a stub that reports version 1.0.0 | Exit status 1, the message names the pinned version |
| 9 | Runs the script again from another directory with a relative `LEFTHOOK_BIN` | Exit status 0, all cases passed, so the path was made absolute before the symlink |

Case 0a is the positive control for case 0b. It uses a repository of its own and the sentinel configuration the script itself wrote, so it changes nothing outside the temporary directory.

## What is real and what is a stub

Real: the dispatcher files, the Git hook mechanism, `core.hooksPath`, the Lefthook binary, and the Lefthook decision in cases 2 and 6.

Stubs: the Beads hooks of the throwaway repository. Each one writes a line to a log file and exits 0. No `bd` command runs, so no issue database is read and no remote sync happens. The `pre-push` dispatcher is present but no push is made, and the throwaway repository has no remote.

Not covered: the repository's own `lefthook.yml` jobs, `oxfmt` and `oxlint` over staged files. They need an installed workspace, and the S0-01 evidence already records five runs of them through `pnpm exec lefthook run pre-commit`. Case 6 proves that a Lefthook decision reaches Git through the dispatcher, not what the two jobs check.

Also not covered: activation in this checkout. `core.hooksPath` here still points at the main checkout's `.beads/hooks`, and the proof changed nothing about it. `core.hooksPath` is repository-common, so one worktree cannot activate the dispatchers for itself alone. Read [`.githooks/README.md`](../../../../.githooks/README.md) before any activation.

The Lefthook warning box about a custom hooks path appears in the transcript. `.githooks/README.md` states that the box is expected and that the jobs under it still run. Case 2 shows both: the box, and the job result under it.
