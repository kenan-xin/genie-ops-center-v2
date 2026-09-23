# scripts

What this folder is for: repository scripts that an operator or an agent runs by hand, written in POSIX shell or Node. Each script states its usage in a header comment.

What must not go in it: application code, build configuration, or a script that writes outside the repository or changes a developer's Git configuration without being asked.

- `prove-hooks.sh`: proves the `.githooks` dispatchers, and the real `lefthook.yml` format job, in throwaway Git repositories. Evidence: [docs/tickets/followups/7pu](../docs/tickets/followups/7pu/index.md).
