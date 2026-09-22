# S0-11 evidence — customer image matrix and Spec 0 CI gates

Bead: `genie-ops-center-v2-1rd.11`. Branch: `feature/s0-11-customer-images-ci-gates`, from
develop `ff47d4a`. Beads owns status; this file records what ran and what could not.

Versions: Nx 23.2.1, Node v26.9.0, pnpm 12.4.2, Vitest 4.1.11, Playwright 1.63.0,
Storybook 10.6.0.

Commits (local, not pushed):

| Commit | Subject |
| --- | --- |
| `96e485f` | `feat(release): add the customer image and development wrappers` |
| `aae7977` | `test(image): add the customer image matrix and exclusion scanners` |
| `8c9a79e` | `feat(ci): wire the Spec 0 gates and repository checks` |
| `41a5bc8` | `docs(s0-11): record the design and evidence` |
| `2642d56` | `fix(image): assert the placeholder denial and the viewer` |
| `44ad661` | `fix(image): use module needles for the empty-image exclusion` |
| `62c73e1` | `fix(release): accept the explicit --publish flag` |
| `6cbe7c9` | `fix(image): scan real bytes and derive the declared build arguments` |
| `39b3529` | `fix(ci): base the develop gates on the pushed commit` |
| (this record) | `docs(s0-11): finalise the evidence and review disposition` |

The two `fix(image)` commits correct the unrun matrix assertions: the placeholder
workspace route renders the R-13 stub denial, so the development case asserts the denial
document with its headers plus the viewer page; and the app's own `/placeholder` dispatch
route always compiles, so the empty-image case asserts the excluded module's package,
folder and ledger needles rather than the bare word.

The approach, the identity handoff and the AC-1 carry are in [design.md](design.md).

## Docker is not available in this session

The image matrix, the release smoke and every Testcontainers path need a Docker daemon,
and none was running. The exact failure, reproduced five times:

```text
$ docker info --format '{{.ServerVersion}}'
failed to connect to the docker API at unix:///home/kenan/.docker/desktop/docker.sock;
check if the path is correct and if the daemon is running: dial unix
/home/kenan/.docker/desktop/docker.sock: connect: no such file or directory
```

`/var/run/docker.sock` is absent, `systemctl is-active docker` is `inactive`, Docker Desktop
is installed at `/opt/docker-desktop` but no process is running, and passwordless sudo is
unavailable. Starting it is a host-service change and was deferred by the coordinator.

Consequence, stated plainly: **every item below is BLOCKED / NOT RUN.** The tests and
workflows that carry them are committed and fail closed — a missing daemon throws a named
diagnostic rather than skipping — but they have not executed against a real image.

| Item | Owner in this ticket | Status |
| --- | --- | --- |
| R-53 development image smoke (placeholder page, health, headers) | `testing/image-matrix.integration.test.ts` | BLOCKED — NOT RUN |
| R-53/AC-17 customer image (selected and explicit empty) absence of routes/tables/migration files | `testing/image-matrix.integration.test.ts` | BLOCKED — NOT RUN |
| AC-18/AC-19 two selections start; core-only boots | `testing/image-matrix.integration.test.ts` | BLOCKED — NOT RUN |
| AC-8/R-33 image history and filesystem scan on a real image | `testing/image-matrix.integration.test.ts` | BLOCKED — NOT RUN |
| Release smoke on the exact candidate identity | `testing/release-smoke.integration.test.ts` | BLOCKED — NOT RUN |
| `nx run @genie/app:test:integration` (isolation, image startup, matrix) | required-tests manifest | BLOCKED — NOT RUN |
| Real GHCR authentication and push | release workflow | NOT RUN — separate release authority |

```bash
# The commands that would run the blocked matrix, once a daemon is up:
docker info --format '{{.ServerVersion}}'
pnpm exec nx run @genie/app:test:integration --skip-nx-cache
pnpm exec nx run @genie/app:test:e2e:fixture          # phone + desktop E2E
scripts/build-customer-image.sh <slug> <version> --no-publish
```

## What was proved (non-Docker)

The release pipeline is pure over an injected command runner, so its ordering and identity
handoff are proved twice: by unit tests over a recording runner, and by an integration test
that spawns the real CLI and wrapper against stub `docker`/`pnpm` binaries on `PATH`.

| Command | Result |
| --- | --- |
| `pnpm exec nx run @genie/app:test --skip-nx-cache` | 18 files, **136 passed** |
| `pnpm exec nx run @genie/generators:test --skip-nx-cache` | 14 files, **183 passed** |
| `pnpm exec nx run @genie/generators:validate --skip-nx-cache` | 7 files, **46 passed** |
| `pnpm exec nx affected -t lint typecheck test build build-storybook --base=develop --parallel=1 --skip-nx-cache` | Success, 7 projects, 25 tasks |
| `pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache` | 7 files, **20 passed** |
| `pnpm run format:check` | clean, 307 files |
| `npx supercov quality patch --all --base develop` | 21 files assessed; property scores only, no introduced blocker |

The release-specific cases:

- `tools/release/pipeline.test.ts`, 13 cases — modules.txt drives `MODULE_INCLUDE`; a changed
  file changes the build argument; an empty file is an explicit empty selection; a missing
  file fails before any Docker call; a failed typecheck, validate, unit, integration or
  smoke does not build or publish; a non-digest identity fails closed; `publish:false` builds
  and smokes but publishes nothing; the injected sink receives the identity; and the R-55
  fallback builds the every-module image tagged `development`.
- `tools/release/cli.test.ts`, 4 cases — the real wrapper and CLI run against stub binaries:
  smoke runs on the digest before `docker tag <digest>` and `docker push`; the explicit
  `--publish` the workflow passes is accepted; and neither a failed gate nor a missing
  customer publishes anything.
- `testing/image-scan.test.ts` (unit, in the fast run), 19 cases — history build arguments
  and secrets, excluded-module package/path/ledger, publicly served migration SQL, dev-only
  tooling and secrets, with a non-vacuous control; the Dockerfile declared-argument parser;
  and the filesystem inventory parser, including a fail-closed oversized file, de-duplication
  and malformed-line rejection.
- `testing/required-runner.test.ts`, 16 cases — the manifest including the four image-matrix
  cases.
- `tools/generators/src/workspace/module-tests.test.ts` + hygiene — R-41 fails a module with
  no test file, proved against a disposable package.
- `validate/clean-checkout-registry.test.ts` — R-21: the registry is never committed,
  identical input is byte-identical, explicit empty differs from populated, unknown id fails.
- `validate/ci-workflows.test.ts` — the three workflow triggers, the root scripts, and that
  no workflow contains a bare `docker push`.
- `validate/affected.test.ts` — AC-1: the shared config preset and the exposed core
  tenant-config schema both mark their consumers affected.

## Preserved from earlier tickets

- S0-09 production exclusion: `@genie/app:test` still includes the devtools-exclusion case,
  and the image matrix's filesystem scan would flag any devtools package or Storybook output.
- S0-10 Storybook confidentiality: `build-storybook` and `test-storybook` ran green; the
  selection/confidentiality suite is untouched.
- S0-06 selection contract: the release wrapper consumes the same data-only inventory and
  `MODULE_INCLUDE` is still the only build argument.

## Independent review

One independent semantic/security review (openrouter GPT Sol, artifact
`s0-11-independent-semantic-security-review` in the epic). One blocker and four majors, all
valid, all fixed in this change; the reviewer confirmed the two earlier matrix fixes
(`2642d56`, `44ad661`) and that a missing Docker daemon fails closed.

| Finding | Severity | Disposition |
| --- | --- | --- |
| `release.yml` passed an unsupported `--publish`, so both release paths exited at argument parsing before any gate | blocker | Fixed: `--publish` is accepted explicitly and `cli.test.ts` drives it |
| `docker tag <identity>` then `docker push <ref>` is not atomic; a second Docker user can retag between them | major | Residual, filed as `genie-ops-center-v2-3aa`: robust closure needs registry-side promotion by digest, which needs registry access this ticket excludes. Recorded in `design.md`, `evidence.md` and a code comment |
| `imageFilePaths` supplied empty content, so the scanner's content rules never ran on a real image | major | Fixed: `collectImageFilesystem` reads bounded real bytes, and `filesystemEntries` fails closed on an oversized file |
| `ci:develop` based affected on `origin/develop`, which is HEAD on a develop push, so affected could be empty | major | Fixed: the workflow bases on `github.event.before` with a zero-SHA fallback, and the wiring test pins it |
| the matrix inspected `node:26-alpine` before any build, which a clean CI daemon lacks | major | Fixed: the Dockerfile's declared arguments are the authority, inherited args are derived from the built image's history, and no base image is pulled |

Confirmed sound by the reviewer: the required-cases manifest join, the explicit-empty/unset
and R-55 handling, `--no-publish` returning before any sink, no workflow literal
`docker push`, and the truthfulness of the blocked/not-run labels.

## Limits

- No Docker: every image, Testcontainers and browser-served item above is BLOCKED.
- The filesystem scan is a path inventory plus the served-corpus content scan; it does not
  decode compressed or exotic encodings and cannot see a run-time-assembled secret.
- The CI workflows are pinned by a wiring test, not executed by a runner here.
- SuperCov without `--all` reported "No changed source files to review" in this worktree;
  the `--all` run above assessed the 21 changed files.
