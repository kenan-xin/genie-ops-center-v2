# S0-11 design — customer image matrix and Spec 0 CI gates

Bead: `genie-ops-center-v2-1rd.11`. Branch: `feature/s0-11-customer-images-ci-gates`, from
develop `ff47d4a`. Read [the ticket](index.md) for the canonical scope and acceptance text;
this file records the approach and its tradeoffs.

## What this ticket owns

R-34/R-51–R-55 and AC-8/AC-17/AC-18/AC-19/AC-21/AC-22: one image per customer from
`modules.txt`, the release wrapper that smokes the candidate before pushing it, the
development fallback for a release tag with no customer, and the repository-wide CI gates.
It also carries the AC-1 config/schema final-integration obligation transferred from the
S0-06 evidence.

## The release pipeline

`apps/genie/tools/release/pipeline.ts` is a pure function over an injected command runner:

```
resolve customer → typecheck → validate → test → integration
    → build candidate (MODULE_INCLUDE only) → resolve immutable digest
    → smoke that digest → publish that digest
```

Decisions:

- **Identity, not the tag.** `docker image inspect -f {{.Id}}` resolves the candidate's
  digest after the build. The smoke boots the digest and the publish tags the digest, so a
  tag that moved between build and push cannot publish a different image. A probe that does
  not return `sha256:<64 hex>` fails closed.
- **Every gate precedes the build.** A failed per-customer typecheck (R-52), a failed
  `validate` (README R-9, module-has-tests R-41), a failed unit run, or an integration run
  that skipped the isolation proof stops the pipeline before it builds, so no publish
  command can run after a gate failure.
- **Smoke precedes publish, on the same bytes.** The smoke is a real test
  (`vitest.release-smoke.config.ts`) that boots the digest against a fresh disposable
  Postgres and asserts `GET /api/health` is exactly `ok` with the five R-47 headers. The
  ordinary integration collection excludes it, because it needs a candidate; the wrapper is
  its only caller and a missing candidate fails closed.
- **The publish boundary is replaceable.** `--publish-command "<argv>"` swaps the
  `docker tag` + `docker push` pair for a safe local sink
  (`apps/genie/tools/release/local-sink.ts`). The ordering unit tests and the wrapper
  integration test drive that boundary; no GHCR authentication or push ran here.
- **Explicit selection only.** A customer release reads `customers/<slug>/deploy/modules.txt`
  and refuses to fall back to the default when the file is missing. The R-55 development
  fallback is a separate flag and a separate wrapper script, and it publishes under a
  `development` tag, never a customer name.

### Why the Dockerfile's `MODULE_INCLUDE` cannot express "unset"

`resolveModuleSelection` distinguishes an unset variable (every module) from an empty one
(no modules). Inside a container build the variable is always present, so an omitted
`--build-arg` yields `MODULE_INCLUDE=""` — an explicit empty selection, not the default.
The development fallback therefore spells the default out: it reads the data-only inventory
and passes every module id explicitly, which is the same effective list as the unset
selection. The source mode is not preserved in the image, but the image content is, and the
fallback is a development image that is never a customer deliverable. Recorded here because
it is the one place the Docker path cannot mirror the resolver's `unset` identity.

## The image matrix

`apps/genie/testing/image-matrix.integration.test.ts` builds two selections — the
placeholder and an explicit empty list — and:

- boots each on a fresh disposable Postgres, asserting health and the R-47 headers;
- asserts the explicitly-empty image renders no placeholder route, creates no
  `placeholder_record` table and no `__drizzle_migrations_placeholder` ledger, and carries
  no placeholder path in its filesystem;
- scans the image history for a second build argument or a secret, and the whole application
  tree — every regular file's real bytes, pnpm symlinks followed and de-duplicated — for an
  excluded module, publicly served migration SQL, development-only tooling and secrets. A
  file above the scanner's 32 MiB cap is reported and fails the proof rather than being
  skipped, so the content rules cannot be evaded by size.

Dev-only tooling is judged by installed **path**, not by content: a manifest that merely
names `@playwright/test` or `vitest` in its `devDependencies` is not an installed dependency,
while a directory under `/node_modules/<package>/` is. Secret content rules are limited to a
private-key block and a long bearer token, plus secret-bearing file types by path (`.env`,
`*.pem`, `*.key`, `*.p12`, `id_rsa`, `.npmrc`). Generic `password: value`-shaped rules were
tried and removed: bundled pg code contains `password: this.password`, so they fail a real
image on its own dependencies.

The build-argument check derives what our Dockerfile declares from the Dockerfile text and
treats every other `ARG` in the image history as inherited, so no base image is pulled and a
clean CI daemon does not fail on a missing one.

`apps/genie/testing/image-scan.ts` holds the needles and the rules as pure functions, unit
tested against controlled fixtures with a non-vacuous control (the same scanner finds an
included module when it is excluded).

The matrix is **mandatory**: its four cases are in the anti-skip manifest
(`testing/required-tests-guard.ts`), so a run that filtered them away fails, and a missing
Docker daemon throws a named diagnostic in `beforeAll` rather than skipping.

## The CI gates

`.github/workflows/{pull-request,develop,release}.yml` call root scripts so the gate logic
is testable without a workflow runner:

- `ci:pr` — `nx affected -t lint typecheck test build build-storybook test-storybook`
  then `nx affected -t test:integration`, then `validate` (README, module-has-tests,
  clean-checkout registry generation, canonical docs, workflow wiring). The two affected
  runs are sequenced because the S0-05 image-freshness guard rebuilds `genie-s005:test`
  inside the integration suite and fails when the Docker context moved since the
  `build-image` dependency, which a single combined invocation triggers
  (`genie-ops-center-v2-453`). Same targets, same proof.
- `ci:develop` — `ci:pr` plus the full Playwright fixture suite at both viewports.
- `release.yml` — discovers `customers/*/deploy/modules.txt`, runs the customer wrapper per
  slug, or the development wrapper when none exists. No workflow contains a bare
  `docker push`; the wrapper is the only publisher.

`tools/generators/src/workspace/validate/ci-workflows.test.ts` pins the triggers, the
commands and the no-bare-push rule.

## R-41 and R-21 enforcement

- R-41: `tools/generators/src/workspace/module-tests.ts` plus a case in the `validate`
  hygiene suite fail a module package that ships no test file. The failure path is proved
  against a disposable package.
- R-21: `tools/generators/src/workspace/validate/clean-checkout-registry.test.ts` asserts
  the generated registry is never committed, that identical input generates identical
  bytes, that an explicit empty selection differs from a populated one, and that an unknown
  id fails instead of widening the selection.

## AC-1 carry from S0-06

S0-06 recorded that config/schema invalidation beyond the selection metadata digest is
AC-1's and should be carried into S0-11 explicitly. `affected.test.ts` now also pins that a
change to the exposed core tenant-config schema marks `@genie/generators` (and `@genie/core`)
affected, alongside the existing shared-preset edge.

## Limits

- The image filesystem scan reads real file bytes with a 32 MiB per-file cap and fails closed
  above it. It detects verbatim, escaped and base64-carried content; it does not decode
  compressed assets or exotic encodings, and it cannot see a secret assembled at run time.
- `docker tag` and `docker push` are two commands, so a second process with Docker access can
  retag the published ref between them. Closing that needs registry-side promotion by digest,
  which needs registry access this ticket does not have. Tracked as
  `genie-ops-center-v2-3aa` and stated as a limit rather than hidden.
- Real GHCR authentication and push remain separately authorized. Nothing here pushed.
