# scripts

What this folder is for: repository scripts that an operator or an agent runs by hand, written in POSIX shell or Node. Each script states its usage in a header comment.

What must not go in it: application code, build configuration, or a script that writes outside the repository or changes a developer's Git configuration without being asked.

- `prove-hooks.sh`: proves the `.githooks` dispatchers, and the real `lefthook.yml` format job, in throwaway Git repositories. Evidence: [docs/tickets/followups/7pu](../docs/tickets/followups/7pu/index.md).
- `build-customer-image.sh <slug> <version>`: reads `customers/<slug>/deploy/modules.txt`, builds the one production image with that explicit include list, smoke-checks the built candidate's immutable digest, then publishes that exact candidate. The authorized `docker push` runs only in the release workflow; `--no-publish` and `--publish-command "<sink>"` exercise the ordering locally. See `--help`.
- `build-development-image.sh <version>`: the R-55 fallback for a release tag when no customer folder exists. Builds the default every-module image and tags its ref `development`, never a customer deliverable.
