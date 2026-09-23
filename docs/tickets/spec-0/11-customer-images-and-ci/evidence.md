# S0-11 evidence — customer image matrix and Spec 0 CI gates

Bead: `genie-ops-center-v2-1rd.11`. Branch: `feature/s0-11-customer-images-ci-gates`.
Baseline develop `ff47d4a`; local develop `d7b5103` merged as merge commit `99dc975`
(merge, not rebase), preserving every reviewed commit. Beads owns status.

Versions: Docker 29.8.0, Nx 23.2.1, Node v26.9.0, pnpm 12.4.2, Vitest 4.1.11,
Playwright 1.63.0, Storybook 10.6.0.

Commits (local, not pushed):

| Commit | Subject |
| --- | --- |
| `96e485f` | `feat(release): add the customer image and development wrappers` |
| `aae7977` | `test(image): add the customer image matrix and exclusion scanners` |
| `8c9a79e` | `feat(ci): wire the Spec 0 gates and repository checks` |
| `41a5bc8` | `docs(s0-11): record the design, evidence and AC-1 carry` |
| `2642d56` | `fix(image): assert the placeholder denial and the viewer` |
| `44ad661` | `fix(image): use module needles for the empty-image exclusion` |
| `62c73e1` | `fix(release): accept the explicit --publish flag` |
| `6cbe7c9` | `fix(image): scan real bytes and derive the declared build arguments` |
| `39b3529` | `fix(ci): base the develop gates on the pushed commit` |
| `15ce412` | `docs(s0-11): record the review disposition and residual` |
| `99dc975` | `Merge branch 'develop' into feature/s0-11-customer-images-ci-gates` |
| `cb0b44d` | `fix(image): make the real-image scan precise` |
| `c3871b7` | `fix(s0-11): stop the checks mutating the image context` |
| `79906bb` | `ci: sequence the pull-request gates as two affected runs` |
| (this record) | `docs(s0-11): record the real Docker proof` |

The approach is in [design.md](design.md). Docker was unavailable in the first
implementation session; the user then started the daemon, and everything below is a real
run on Docker 29.8.0.

## The real image matrix (AC-17/AC-18/AC-19, R-53)

```bash
cd apps/genie
pnpm exec vitest run --config vitest.integration.config.ts testing/image-matrix.integration.test.ts
# Test Files 1 passed (1); Tests 4 passed (4); ~47s
```

- **development image** (placeholder): boots on a fresh disposable Postgres, `GET
  /api/health` is exactly `ok` with all five R-47 headers; `/placeholder` is a 200 document
  carrying the standard headers and the documented R-13 denial (the entry needs
  `placeholder:use`, the stub grants only `placeholder:read`); `/viewer/placeholder`
  renders.
- **explicitly empty selection**: boots core-only, health `ok` with the baseline policy,
  `/placeholder` returns **404**, no `placeholder_record` table and no
  `__drizzle_migrations_placeholder` ledger on the database it migrated itself, and no
  `@genie/module-placeholder` package, `packages/modules/placeholder/` folder or
  `__drizzle_migrations_placeholder` path in the image filesystem.
- **two selections both build and start** on their own fresh databases.
- **history and filesystem**: the Dockerfile declares exactly `["MODULE_INCLUDE"]`; the
  image history carries no other argument of ours and no secret; the whole application tree
  (real bytes, pnpm symlinks followed and de-duplicated) has no installed dev-only package
  (`@tanstack/*-devtools`, `@playwright/`, `vitest`, `@storybook/`, `@nx/`,
  `@genie/generators`, `oxlint`, `oxfmt`, `lefthook`, `testcontainers`), no `storybook-static`
  or `.stories.`, no publicly served migration SQL, and no secret-bearing file or private key.

The four cases are in the anti-skip manifest, so a filtered run fails, and a missing daemon
throws a named diagnostic instead of skipping.

## The full mandatory integration layer

```bash
pnpm exec nx run @genie/app:test:integration --skip-nx-cache
# Test Files 13 passed (13); Tests 123 passed (123); ~2m
```

Includes `image.startup.test.ts` (13), `image-matrix` (4), `isolation` (2),
`selection-cache` (6), `devtools-exclusion` (9), `viewer-background` (4), `headers` (19),
`transport` (4), `prune-public-migration-sql` (15), `required-runner` (16), `image-scan`
(21), `image-process` (9), `proxy-bundle` (1). The Playwright fixture and dev suites run as
dependencies, six cases each at a phone and a desktop viewport.

Per-project integration:

| Project | Command | Result |
| --- | --- | --- |
| app | `nx run @genie/app:test:integration --skip-nx-cache` | 13 files, **123 passed** |
| core | `nx run @genie/core:test:integration --skip-nx-cache` | 3 files, **32 passed** |
| module-placeholder | `nx run @genie/module-placeholder:test:integration --skip-nx-cache` | 1 file, **4 passed** |
| Storybook | `nx run @genie/storybook:test:integration --skip-nx-cache` | 1 file, **29 passed** |

## Release wrapper, identity handoff and safe publish boundary

```bash
./scripts/build-development-image.sh 0.0.0-s011 --no-publish
# candidate sha256:aced6b71cfc0a13b9252a38c58edb1d976b43e7d9211daa376f6ba66e67e01ce passed smoke; no publish was requested
```

```bash
mkdir -p customers/s011-probe/deploy && printf 'placeholder\n' > customers/s011-probe/deploy/modules.txt
GENIE_SINK_FILE=/tmp/s011-sink.log \
  ./scripts/build-customer-image.sh s011-probe 0.0.0-s011 \
  --publish-command "node apps/genie/tools/release/local-sink.ts"
# candidate sha256:db6ffc4ad48429a544b57b588572f1714068e52d6185a0aaebce8b29ba59c337 passed smoke; published ghcr.io/genie-ops-center/genie-ops-center:s011-probe-0.0.0-s011
# sink log: sha256:db6ffc4a…  ghcr.io/genie-ops-center/genie-ops-center:s011-probe-0.0.0-s011
```

Both runs executed the real gates (typecheck, validate, unit, integration), built the image
with `MODULE_INCLUDE` from the explicit list, resolved the immutable digest, ran the real
`vitest.release-smoke.config.ts` against that digest, and only then reached the publish
boundary — which was disabled for the first run and a safe local sink for the second. No
GHCR authentication or push happened. The fixture customer was removed afterwards (exact
paths, then `rmdir`).

## CI gates

```bash
NX_BASE=develop pnpm run ci:pr
# nx affected -t lint typecheck test build build-storybook test-storybook  -> Success, 7 projects
# nx affected -t test:integration                                          -> Success, 4 projects, 6 tasks
# nx run @genie/generators:validate                                        -> 50 passed
```

`ci:pr` runs the non-integration gates and the integration layer as two sequenced affected
runs: the S0-05 image-freshness guard rebuilds `genie-s005:test` inside the integration
suite and fails when the Docker context moved since the `build-image` dependency, which
happens in one combined invocation (filed `genie-ops-center-v2-453`). Same targets, same
proof, no weakening. The AC-1 gate `nx affected -t build test lint typecheck` is green
separately, as is `nx affected -t test:integration` alone.

`ci:develop` adds the full Playwright fixture suite; `release.yml` runs the customer wrapper
per discovered `customers/*/deploy/modules.txt`, or the development wrapper when none
exists. No workflow contains a bare `docker push`.

## Unit, format and quality

| Command | Result |
| --- | --- |
| `nx run @genie/app:test` | 18 files, 139 passed |
| `nx run @genie/generators:test` | 14 files, 183 passed |
| `nx run @genie/generators:validate` | 7 files, 50 passed |
| `nx run @genie/storybook:test-storybook` | 7 files, 20 passed |
| `pnpm run format:check` | clean, 307 files |
| `npx supercov quality patch --all --base develop` | changed files assessed; property scores only, no introduced blocker |

## Independent review

One independent semantic/security review (openrouter GPT Sol, artifact
`s0-11-independent-semantic-security-review`). One blocker and four majors, all valid, all
fixed except one filed. The reviewer confirmed the two earlier matrix fixes (`2642d56`,
`44ad661`), that a missing Docker daemon fails closed, the manifest join, the
unset/empty/R-55 handling, `--no-publish` ordering, and that no workflow contains a bare
`docker push`.

| Finding | Severity | Disposition |
| --- | --- | --- |
| `release.yml` passed an unsupported `--publish`, so both release paths exited at argument parsing | blocker | Fixed `62c73e1`; `--publish` is accepted and driven by `cli.test.ts` |
| `docker tag <identity>` then `docker push <ref>` is not atomic | major | Residual, filed `genie-ops-center-v2-3aa` (P1, blocks the first real registry release, not the stub-boundary acceptance); recorded in `design.md` and a code comment |
| `imageFilePaths` supplied empty content, so content rules never ran | major | Fixed `6cbe7c9`; `collectImageFilesystem` reads bounded real bytes and fails closed on an oversized file |
| `ci:develop` based affected on `origin/develop`, which is HEAD on a develop push | major | Fixed `39b3529`; bases on `github.event.before` with a zero-SHA fallback |
| the matrix inspected `node:26-alpine` before any build | major | Fixed `6cbe7c9`; declared args come from the Dockerfile, inherited args from history |

### Re-review after the real Docker proof (artifact `s0-11-real-docker-rereview`)

One blocker and three minors, all valid, all fixed:

| Finding | Severity | Disposition |
| --- | --- | --- |
| The release smoke checked only health/headers; the R-53 confidentiality/content scan ran against a separately built image, so a selection-specific candidate leak could publish | blocker | Fixed: the smoke now takes `GENIE_SMOKE_INCLUDE`, computes the real excluded set, and runs the history/filesystem scan plus excluded route/table/ledger checks against `GENIE_SMOKE_IMAGE` itself |
| The develop all-zero fallback based affected on `origin/develop`, which is HEAD | minor | Fixed: it bases on git's empty tree (`4b825dc…`), so every project is affected; pinned in the wiring test |
| `buildImageWith` swallowed docker build errors into `false`, hiding the daemon-loss cause | minor | Fixed: it throws with the tag, selection and build log, and `cause` |
| `design.md` claimed a moved tag cannot affect the pushed bytes | minor | Fixed: the paragraph now states the digest binding and the residual race |

The re-review confirmed the first-review fixes (`--publish`, real-byte scan, path-based
dev-tooling, develop NX_BASE, declared-argument derivation, the `ci:pr` split, and the
`3aa` disposition), and found no false GHCR/push claim. The reviewer's own rerun passed the
first two matrix cases before Docker Desktop vanished, then failed the rest closed — which
is the fail-closed behavior the fix to `buildImageWith` now reports with a cause.

**Post-merge Docker re-verification is BLOCKED.** Docker Desktop stopped after the first
real run (`docker info` fails with ENOENT for `/home/kenan/.docker/desktop/docker.sock`).
The blocker fix and the merge of develop `c0c7399` are committed, but the candidate-specific
smoke has not been re-run against a live daemon. The genuine matrix proof stands at the
pre-merge revision `ec314a7`; the merge touched only `packages/config` (oxfmt and its
fixture-visibility test) and docs, so it cannot affect the image or integration code.

## Findings filed during the work

| Bead | Finding |
| --- | --- |
| `genie-ops-center-v2-3aa` | registry tag can be retagged between `docker tag` and `docker push` (P1, first real release) |
| `genie-ops-center-v2-453` | the S0-05 image-freshness guard fails in a combined affected invocation (worked around by sequencing `ci:pr`) |
| `genie-ops-center-v2-w7u` | config lint raced config test on the `__antislop__` probe; develop's `7lj` fixture-ignore work appears to fix it, and the S0-11 image context now ignores the prefixes too |

## Limits

- Real GHCR authentication and push remain separately authorized. Nothing was pushed.
- The residual tag/push race (`3aa`) is the one publish hardening not closed here.
- The filesystem scan reads real bytes with a 32 MiB per-file cap and fails closed above it;
  it does not decode compressed or exotic encodings and cannot see a run-time-assembled
  secret. Generic `password:`-shaped content rules were removed because bundled third-party
  code false-positives on them.
- Testcontainers can report a host port-bind timeout on a long-lived Docker Desktop. The
  remedy is scoped to this suite's own resources only: Testcontainers labels the containers
  and networks it creates, so remove just those, e.g.
  `docker ps -aq --filter label=org.testcontainers=true | xargs -r docker rm -f` and the
  matching `docker network ls -q --filter label=org.testcontainers=true | xargs -r docker
  network rm`, then retry; otherwise let Testcontainers' own teardown handle it. Do **not**
  run a global `docker rm -f $(docker ps -aq)` or `docker network prune -f`: those are
  destructive across unrelated user resources and are never part of this suite's cleanup.

## Build-input exclusion (pg4), 2026-09-23

Bead `genie-ops-center-v2-1rd.11.1`. Branch merged develop `0be0b55` first (merge `119935c`;
the spec, S0-06 evidence and ticket index conflicts resolved to develop's text, plus S0-11's
two script lines in `scripts/README.md`). Docker 29.8, real `docker build` of the production
Dockerfile throughout. Nothing was pushed or published.

What changed:

- `tools/generators/src/selection/prune.ts` (dependency-free, reuses `readModuleInventory` and
  `resolveModuleSelection`): refuses an unset `MODULE_INCLUDE`, resolves the selection before
  removing anything, removes every unselected module package, then fails unless the remaining
  `packages/modules/` folders equal the selection. Prints `[module-prune] kept: ...` and
  `[module-prune] removed: ...`.
- `deploy/Dockerfile`: `RUN node tools/generators/src/selection/prune.ts` before
  `pnpm install`. The `ENV MODULE_INCLUDE=${MODULE_INCLUDE}` copy is removed. Probe: with a
  bare `ARG`, a `RUN` step sees `undefined` when no `--build-arg` is passed, `""` for
  `--build-arg MODULE_INCLUDE=` and the value otherwise, so unset and empty stay distinct.
- `apps/genie/next.config.ts` + `apps/genie/tsconfig.build.json`: `next build` type-checks
  shipped source only. Found by the empty-selection proof: the build type-check covered
  `src/registry.test.ts` and `testing/*.test.ts`, which import `@genie/module-placeholder`, so
  every build that pruned placeholder failed with `TS2307` even with no application import.
  The `typecheck` target still checks every file through `tsconfig.json`.
- `apps/genie/testing/image-scan.ts`: only `"/m/<id>"` and `"/admin/m/<id>"` left
  `excludedModuleContentNeedles`. Path needles, the ledger needle, migration-SQL, dev-tooling,
  secret and `MODULE_INCLUDE`-only build-argument checks unchanged.
- `.dockerignore`: `**/next-env.d.ts` (`genie-ops-center-v2-453`, see below).

TDD record:

```bash
# prune unit (RED: module missing; GREEN after prune.ts)
cd tools/generators && pnpm exec vitest run src/selection/prune.test.ts   # 8 passed
# mutation: disabling the stray-folder check fails exactly
#   "fails when a folder the selection does not name remains after the prune"
# image-scan (RED: 2 failed for the right reason, route needle still a finding; GREEN 24 passed)
cd apps/genie && pnpm exec vitest run --config vitest.integration.config.ts testing/image-scan.test.ts
# docker proofs, RED before the Dockerfile change: 7 failed; the extra fixture folder reached
#   pnpm install --frozen-lockfile -> ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER, and no refusal lines
cd apps/genie && pnpm exec vitest run --config vitest.integration.config.ts testing/image-prune.integration.test.ts
# GREEN: 7 passed, twice in a row on a warm cache (72s, 69s)
```

`image-prune.integration.test.ts` (in the mandatory manifest) builds staged copies under the
OS temp directory, each carrying the extra fixture module `permitted-viewer` under
`packages/modules/` and a unique nonce file so the prune step never restores from the layer
cache:

| Case | Selection | Result |
| --- | --- | --- |
| keeps the selected module and removes every other module folder, as the build log shows (AC-5) | `placeholder` | builds; `kept: placeholder`, `removed: permitted-viewer` |
| prunes every module folder for an explicitly empty selection although the app depends on placeholder | `""` | builds; `kept: (none)`, `removed: permitted-viewer, placeholder` |
| refuses an unset MODULE_INCLUDE | no build argument | fails: `[module-prune] MODULE_INCLUDE is unset` |
| fails the build when a folder the selection does not name remains | `placeholder` + manifest-less `packages/modules/stray/` | fails: `packages/modules holds stray, which the selection does not name` |
| resolves a direct and a subpath import of a selected module (control) | `placeholder` | builds |
| fails the build on a direct import of an excluded module | `""` | fails: `./apps/genie/src/app/layout.tsx:1:1 Module not found: Can't resolve '@genie/module-placeholder'` |
| fails the build on a subpath import of an excluded module | `""` | fails: same for `@genie/module-placeholder/presentation`, attributed to `layout.tsx` |

AC-25 fixture image, placeholder pruned while the staged app manifest still depends on it:

```bash
pnpm exec nx run @genie/app:build-fixture-image --skip-nx-cache
# [module-prune] kept: failing-viewer, invalid-viewer, permitted-viewer
# [module-prune] removed: placeholder
# NX Successfully ran target build-fixture-image
```

Gates:

```bash
pnpm exec nx affected -t build test lint typecheck               # Success, 7 projects
pnpm exec nx run @genie/app:test:integration --output-style=stream
# Test Files 14 passed (14); Tests 134 passed (134); manifest satisfied
pnpm exec nx affected -t build test lint typecheck test:integration   # Success, 7 projects (one combined run)
pnpm exec nx run @genie/generators:validate --skip-nx-cache      # 50 passed
scripts/build-development-image.sh 0.0.0-pg4 --no-publish
# candidate sha256:c1a4dc4107b3dd0fea19194f863323956dec469d59b2cc39a6de28fc81042808 passed smoke; no publish was requested
```

The app integration run includes `image-prune` (7), `image-matrix` (4), `image.startup` (13),
`image-scan` (24), `required-runner` (17) and the fixture and dev Playwright suites at both
viewports. One earlier streamed run failed only on a Testcontainers Postgres port-bind timeout
in the matrix's empty case (the Docker Desktop limit below); the rerun passed.

Found and fixed on the way:

- `required-runner.test.ts` (from develop, `5ay`) relocated the runner and the guard but not
  `release-matrix-cases.ts`, which the S0-11 guard imports, so the spawn-failure case crashed
  with `ERR_MODULE_NOT_FOUND`. The helper now copies it.
- `genie-ops-center-v2-453`: `apps/genie/next-env.d.ts` is git-ignored but was in the image
  context, and `next build` and `next dev` write different contents to it, so
  `test:e2e:dev` between `build-image` and the freshness guard moved the image. Observed as
  `built from older source than this working tree` in `nx affected -t test:integration`.
  Docker-ignoring it made the combined invocation pass once. The Bead stays open for the
  coordinator; `ci:pr` still sequences the two runs.

Residuals: a relative import of `apps/genie/tools/fixture-modules` files into application
code is not caught by the prune (documented). The prune removes unselected module packages,
meaning folders with a module manifest. Any other folder under `packages/modules/` fails the
check instead of being removed, which is stricter than "removes every folder" and is what
gives the stray-folder negative test a real target.
