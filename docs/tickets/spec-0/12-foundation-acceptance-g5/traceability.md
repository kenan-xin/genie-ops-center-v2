# S0-12 traceability: Spec 0 acceptance on the integrated revision

Bead: `genie-ops-center-v2-1rd.12`. Recorded 2026-09-23. Beads owns live status. This record closes no Bead.

## Revisions and toolchain

| Item | Value |
| --- | --- |
| Integrated revision | develop `25177fb` (S0-11 merged, every earlier Spec 0 ticket closed) |
| Harness fix 1 | `97e71a9`: the generated-module link install is not frozen under `CI=true` |
| Harness fix 2 | `3005743`: the generator proof strips color codes before it reads the story count |
| CI fix | `0d96951`: new `@genie/app:test:e2e` target for the main Playwright suite, run by `ci:develop` (F2) |
| Node, pnpm, Docker | 26.9.0, 12.4.2, server 29.8.0 |
| Pinned tools | Nx 23.2.1, Next 16.3.5, Storybook 10.6.0, Vitest 4.1.11, Playwright 1.63.0, oxlint 1.83.0, oxfmt 0.68.0, lefthook 2.1.14, Tailwind 4.3.3 |

The two harness fixes change test code only. The CI fix changes the app target list, the root `ci:develop` script, the Playwright output directory and the CI wiring test. None of the three touches product source or a workflow file. Every run below `25177fb` that the fixes did not affect was repeated at `97e71a9` or `3005743`, so each result names its revision.

The raw logs are under `/tmp/s012/` on the acceptance host. They are not kept in the repository. The excerpts below are copied from them.

## Commands and results

| Id | Command | Revision | Result |
| --- | --- | --- | --- |
| C1 | remove every `node_modules`, then `pnpm install --frozen-lockfile` | `25177fb` | exit 0 |
| C2 | `pnpm exec nx run-many -t lint typecheck test build validate --skip-nx-cache` | `25177fb`, again at `97e71a9` with `--output-style=static` | exit 0 both times, 24 tasks. Unit counts at `97e71a9`: config 248, core 314, ui 3, placeholder 30, app 152, storybook 9, generators 196, validate 54. The app build compiled every route with Turbopack |
| C3 | `node tools/generators/scripts/prove-generated-module.ts generated-proof` | `25177fb` under `CI=1`: exit 1. `97e71a9` without `CI`: exit 0. `3005743` under `CI=1`: exit 0 | See [finding F1](#f1-generated-module-install-under-ci). The green run: lint, typecheck and unit pass, discovery by selection and Storybook, 4 real-database cases, 5 generated stories pass (20 against 15 without the module), image with `[module-prune] kept: generated-proof, placeholder`, 6 browser denial cases at phone and desktop. The workspace was clean after every run, including the failed one |
| C4 | `sh scripts/prove-hooks.sh` | `25177fb` | exit 0, cases 0a to 11 pass with the pinned lefthook 2.1.14 in a throwaway repository |
| C5 | `pnpm exec nx run @genie/core:test:integration --skip-nx-cache` | `25177fb` | exit 0, 3 files, 33 tests (migrator 13, tenant context 3, required runner 17) |
| C6 | `pnpm exec nx run @genie/module-placeholder:test:integration --skip-nx-cache` | `25177fb` | exit 0, 4 tests |
| C7 | `pnpm exec nx run @genie/storybook:test:integration --skip-nx-cache` | `25177fb` under `CI=1`: exit 1, 28 of 29. `97e71a9` under `CI=1`: exit 0, 29 of 29 | See F1 |
| C8 | `pnpm exec nx run @genie/app:test:integration --skip-nx-cache` | `25177fb`: exit 1. `97e71a9`: exit 1. `3005743`: exit 0, 14 files, 134 tests | Both failures were the Testcontainers message `Timed out after 10000ms while waiting for container ports to be bound to the host`, in `viewer-background` and then in `image.startup`. The required-test runner failed each run and named the skipped mandatory cases. The same target also passed inside C11 and C12 at both revisions |
| C9 | `pnpm exec nx run @genie/storybook:test-storybook --skip-nx-cache` and `build-storybook --skip-nx-cache` | `25177fb` | exit 0, 7 files, 20 tests; static build exit 0 |
| C10 | `nx run @genie/app:test:e2e:fixture` and `test:e2e:dev`, both `--skip-nx-cache` | `25177fb` | exit 0, 6 passed each (3 phone, 3 desktop) |
| C11 | `pnpm run ci:develop` (base `origin/develop` = `3f928ea`, so all 7 projects are affected) | `25177fb`: exit 1, only `@genie/storybook:test:integration` (F1). `97e71a9`: exit 0 | Green run: lint, typecheck, test, build, build-storybook and test-storybook for 7 projects; test:integration for 4 projects; validate; test:e2e:fixture |
| C12 | `pnpm exec nx run-many -t build test lint typecheck test:integration` | `25177fb`: exit 1, only F1. `97e71a9`: exit 0 | `@genie/app:test:integration` passed inside the combined invocation both times. This is the second clean combined run that Bead `genie-ops-center-v2-453` waits for |
| C13 | `scripts/build-development-image.sh 0.0.0-s012 --no-publish` | `25177fb` | exit 0, `candidate sha256:d01edce297dd4e62922aa4b867eea0fa3b3d6fe7a0ac3443d4a8ab576cee9da5 passed smoke; no publish was requested` |
| C14 | `pnpm exec playwright test --config apps/genie/playwright.config.ts`, from the workspace root | `3005743` | exit 0, 24 passed, 6 skipped. The 6 skips are `generated-module.spec.ts`, which skips without a generated module by design and ran green inside C3. See [finding F2](#f2-the-main-playwright-suite-was-not-in-the-pipeline) |
| C15 | `docker build --no-cache --progress=plain -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder .`, then the same with `MODULE_INCLUDE=` and with no argument | `3005743` | placeholder: exit 0, `kept: placeholder`, `removed: (none)`. Empty: exit 0, `kept: (none)`, `removed: placeholder`, Next compiled. Unset: exit 1, `MODULE_INCLUDE is unset. An image build must name its module selection` |
| C16 | `docker history --no-trunc` and `docker image inspect` on both C15 images | `3005743` | No build argument appears in the runtime-stage history, and the environment holds only `PATH`, `NODE_VERSION`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `PORT` and `HOSTNAME` |
| C17 | `nx run @genie/storybook:storybook --port 6123 --ci`, then `GET /index.json` | `3005743` | HTTP 200, 27 entries under `UI`, `Core` and `Modules`. The server was stopped after the check |
| C19 | `vitest run --config vitest.validate.config.ts src/workspace/validate/ci-workflows.test.ts` in `tools/generators` | before and after `0d96951` | Red before the fix: `runs the ordinary app E2E suite on develop beside the fixture suite` fails, 1 failed, 10 passed. Green after: 11 passed |
| C20 | `nx run @genie/app:test:e2e --skip-nx-cache` under `CI=1` | `0d96951` | exit 0, 24 passed, 6 skipped (generated-module file, by design), after `build-image`. With a temporary spec `e2e/zz-s012-injected-failure.spec.ts` that asserts `expect(1).toBe(2)`: exit 1, the case failed at phone and at desktop. The temporary spec was deleted after the run |
| C21 | `pnpm run ci:develop` under `CI=1` | `0d96951` | exit 0: lint, typecheck, test, build, build-storybook and test-storybook for 7 projects; test:integration for 4 projects; validate 55 tests; test:e2e:fixture 6 passed; test:e2e 24 passed, 6 skipped |
| C18 | `nx show projects --affected --files=<file>` and `nx graph --file` | `3005743` | A change in `packages/modules/placeholder` affects placeholder, app, generators and storybook only. A change in the shared Tailwind preset affects every consumer. Tags: app, app, core, ui, module, config, tooling, one each. `nx.json` sets `neverConnectToCloud: true` |

## Acceptance criteria

Counts: 29 PASS, 0 FAIL, 1 NOT RUN. Before the CI fix `0d96951`, AC-17 and AC-22 failed (F2).

| AC | Requirement in one line | Owner tickets | Evidence (commands above) | Result |
| --- | --- | --- | --- | --- |
| AC-1 | Affected runs only the change and its dependents, cache hits, one classification per project, preset and schema changes invalidate | S0-01, S0-06, S0-11 | C18; C11 shows `[local cache]` and `existing outputs match the cache` hits; `affected.test.ts` in C11 (preset and exposed core schema) | PASS |
| AC-2 | Forbidden ui-to-core, module-to-module and `pg` imports fail lint; oxfmt and oxlint run on a staged file through lefthook | S0-01 | C2 config boundary suite (248 tests, for example `stops one module from importing another module through the real package spelling`); C4 cases 2, 6, 10 and 11 | PASS |
| AC-2a | Allowed and rejected config, tooling and runtime fixtures, including subpath and relative spellings; generated output passes its destination rules | S0-01, S0-03, S0-08 | C2 (for example `allows tools/generators to import the build-safe core tenant-config schemas`, `rejects tooling importing core by relative path`); C3 lint of the generated module | PASS |
| AC-3 | Placeholder declares every point, mounts with no core change, `can()` grants only `placeholder:read`, contract test fails missing admin or use keys | S0-03, S0-04, S0-05 | C2 core `module-contract` tests; C6; C14 `the placeholder read procedure succeeds through the real transport` | PASS |
| AC-4 | One context builder, no `db` singleton, two-context isolation passes, a skipped isolation run fails | S0-05, S0-07, S0-11 | C8 `isolation.integration.test.ts` 2 passed; the two failed C8 runs show the runner failing on skipped mandatory cases; C2 boundary tests for testing code | PASS |
| AC-5 | A placeholder-only build carries no other module; two landing flags fail the registry; zero landing entries succeed. Amended by `pg4` to the builder-stage prune | S0-06, S0-11 | C15 prune logs; C8 `image-prune.integration.test.ts` 7 passed; C2 app `registry.test.ts` | PASS |
| AC-6 | Core history then module histories, each in its own table; a second start applies nothing | S0-04, S0-07 | C5 migrator 13 cases; C8 `image.startup.test.ts` 13 passed | PASS |
| AC-7 | `module-new demo` passes every stage with no hand edit; `tenant-new` writes seven files and rejects a misplaced branding key | S0-08, S0-10 | C3 green runs; C2 generators 196 tests (`tenant-new` generator and render) | PASS |
| AC-8 | Customer script builds and pushes; history shows only `MODULE_INCLUDE`; no secret; health returns `ok` | S0-11, push in 1rd.12.1 | Local part: C13, C16, C8 `image-matrix` and `image-scan`. The real registry push is not run | NOT RUN: the push is Bead `genie-ops-center-v2-1rd.12.1`, authorized but pending |
| AC-9 | Two migrators, lock held, timeout code, same session, injected failure releases, connection loss aborts | S0-07 | C5 migrator 13 cases and required runner 17 | PASS |
| AC-10 | Shared unit preset everywhere, a Postgres container per integration file, a module package without tests fails | S0-01, S0-04, S0-11 | C2; C5, C6, C8; generators `module-tests.test.ts` in C2 | PASS |
| AC-11 | Two Playwright projects, placeholder main path passes in both | S0-05 | C14 and C20, phone and desktop | PASS |
| AC-12 | Development build shows the devtools tabs; production build has no devtools package | S0-09, S0-11 | C10 `test:e2e:dev`; C8 `devtools-exclusion.test.ts` 9 passed | PASS |
| AC-13 | Placeholder strings resolve through the English catalog; a missing key fails | S0-09 | C2 app `catalogue.test.ts` and `catalogue-coverage.test.ts` | PASS |
| AC-14 | JSON log line with request, tenant and user ids; secrets censored | S0-04, S0-05 | C2 core `services/logging` and app `request-id.test.ts` | PASS |
| AC-15 | Safe HTTP and tRPC error envelopes with matching request ids and no raw causes | S0-05 | C8 `transport.integration.test.ts` 4 passed | PASS |
| AC-16 | Viewer response has the five headers and one enforced CSP with only `frame-src` replaced | S0-05 | C8 `headers.integration.test.ts` 19 passed; C14 `security-headers.spec.ts` | PASS |
| AC-17 | PR, develop and release gates; develop also runs the full Playwright suite at both viewports; both smoke cases | S0-11, S0-12 | C21 develop gate with `test:e2e` and `test:e2e:fixture` at both viewports; C19; C11 PR gate; C13 and C8 `image-matrix` smoke cases | PASS for the local gates. The release-tag push itself stays with 1rd.12.1 (see AC-8) |
| AC-18 | Two include lists build from one Dockerfile and both images start | S0-11 | C15 two selections; C8 `image-matrix.integration.test.ts` 4 passed | PASS |
| AC-19 | Boot on an empty database with only core history, and serve | S0-11 | C8 `image-matrix` empty-selection case | PASS |
| AC-20 | Placeholder passes every Section 0 contract point; stub refuses all but `placeholder:read` | S0-03, S0-04, S0-05, S0-08 | C2 core contract tests; C6 | PASS |
| AC-21 | All four layers green in one pipeline, with isolation and Storybook browser tests | S0-11, S0-12 | C21 at `0d96951`: unit, integration with isolation, Storybook browser tests, and both E2E suites | PASS |
| AC-22 | E2E runs at phone and desktop, and a failure at either viewport fails the pipeline | S0-11, S0-12 | C20 injected failure fails `test:e2e` at phone and desktop; C21 runs it in `ci:develop` | PASS |
| AC-23 | CSP provider contract typechecks for placeholder and generated modules; omission, empty, duplicates, invalid values, failures and tenant isolation never broaden policy | S0-03, S0-05, S0-08 | C2 core `content-security-policy` tests; C3 typecheck; C10 fixture suite | PASS |
| AC-24 | Selection-aware cache reuse and isolation, `modules.txt` changes, unset and empty distinct, local cache only. Amended by `pg4` | S0-06, S0-11 | C8 `selection-cache.test.ts` 6 passed and `image-prune` 7 passed; C15; C18 `neverConnectToCloud` | PASS |
| AC-25 | Header coverage for every response class, viewer-only provider calls, 308 normalization exception, slash spellings | S0-05 | C8 `headers` 19, `viewer-background` 4, `proxy-bundle` 1; C14 | PASS |
| AC-26 | Build without runtime values, invalid configuration exits before a connection, migrations gate health, one context and pool | S0-05 | C8 `image.startup.test.ts` 13 passed; C14 `context-sharing.spec.ts`; C2 app build | PASS |
| AC-27 | Storybook dev, build and browser tests on the pinned toolchain; discovery; failures propagate | S0-02, S0-08, S0-10 | C9; C17; C3 story count; C7 `passes again once the failing stories are removed` | PASS |
| AC-28 | Scoped Storybook outputs exclude unselected content; runtime images exclude Storybook | S0-10, S0-11 | C7 29 passed at `97e71a9`; C8 `image-scan` | PASS |
| AC-29 | Category and Settings contract types, rejection of malformed contributions, generated declarations typecheck | S0-03, S0-08 | C2 core `module-contract` tests; C3 typecheck | PASS |

## Gates G1 and G2, rerun after later changes

| Gate proof | Rerun here | Result |
| --- | --- | --- |
| G1 Storybook compatibility | C9, C17, C7 | PASS: dev server, static build and 20 browser tests on the pinned toolchain |
| G2 production startup | C8 `image.startup` 13 cases, C13 | PASS |
| G2 one context | C14 `context-sharing.spec.ts`, C8 `image.startup` shared-context case | PASS |
| G2 headers and CSP | C8 `headers` and `viewer-background`, C10 fixture suite, C14 security headers | PASS |

## Audit items

| Item | Evidence | Result |
| --- | --- | --- |
| ygn naming | Bead closed at `19bdf39`. At `25177fb` C2 passes the singular naming tests (`module-naming.test.ts`, boundary fixtures for singular package and subpath names) and C3 generates `@genie/module-generated-proof` in `packages/modules/generated-proof/` | PASS |
| Staged-hook behavior, AC-2, R-5b, R-8 | C4 proves the tracked dispatchers and the real lefthook jobs in a throwaway repository. The live-checkout activation Bead `2o4` stays separate. This checkout already had `core.hooksPath=.githooks` before this ticket started, and this ticket did not change it | PASS for the canonical behavior |
| 3yv preset consumption | C2 app `src/styles/tailwind-preset.test.ts` 3 passed; C18 preset change affects every consumer | PASS |
| pg4 build-input exclusion | Kept and removed folders in the build log (C15); empty-selection build prunes `placeholder` (C15) and the fixture image builds in C11; failing direct and subpath import tests with a control, the stray-folder negative test and the unset refusal (`image-prune.integration.test.ts`, 7 passed in C8) | PASS |

## Findings

### F1: generated-module install under CI

Under `CI=true`, pnpm defaults to `--frozen-lockfile`. The generated-module link install in `apps/storybook/testing/selection-confidentiality.integration.test.ts` then failed with `ERR_PNPM_OUTDATED_LOCKFILE`, so `ci:develop` failed at `25177fb`. GitHub Actions sets `CI=true`, so the develop workflow will fail the same way. The same install in `prove-generated-module.ts` failed too, and that script also missed the story count because of color codes. Found and fixed here: commits `97e71a9` and `3005743` fix both in test code only. Owners: S0-10 for the suite, S0-08 for the script. No Bead is needed.

### F2: the main Playwright suite was not in the pipeline

`apps/genie/playwright.config.ts` holds the placeholder main path, the security-header browser checks, context sharing and the generated-module denial. No Nx target and no root script runs it, and `ci:develop` runs only `test:e2e:fixture`. The suite passed when it ran (C14), but a failure in it could not fail the develop pipeline, so AC-17 and AC-22 failed at `25177fb`. Owner: S0-11, which is closed and merged. The coordinator directed this ticket to fix it as a final targeted correction. Commit `0d96951` adds `@genie/app:test:e2e`, uncached and after `build-image`, like the other E2E targets. The script runs from the workspace root, because the suite resolves its compose file from the current directory. The suite gets its own output directory `test-results/e2e`. `ci:develop` runs it after the fixture suite. Evidence: C19, C20 and C21.

### F3: Testcontainers port binding

Two standalone app integration runs failed on the port-bind timeout of Docker Desktop. A third run and every combined run passed. The required-test runner failed both flaky runs, so no skip counted as a pass. This is environment behavior, not a defect in Spec 0.

## Outstanding G5 item

| Item | Owner | State |
| --- | --- | --- |
| One pre-release tag push to GHCR, with the published digest equal to the smoke-tested digest | Bead `genie-ops-center-v2-1rd.12.1` | Authorized by the owner, pending. Not run by this ticket |

G5 stays open until the push in `1rd.12.1` is recorded. Every other Spec 0 acceptance criterion has a PASS result on a named revision.
