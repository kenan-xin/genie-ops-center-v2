import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

import { RELEASE_MATRIX_FULL_NAMES } from "./release-matrix-cases.ts";

/**
 * The app integration manifest.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. Each entry is derived from a named acceptance clause,
 * not from a blanket "all tests mandatory" rule:
 *
 * - the two-database isolation proof (R-20, AC-4),
 * - the one-context proof across real framework bundles (AC-26),
 * - the viewer provider-count proof (R-49a, AC-25), zero calls on background
 *   requests at the viewer URL and exactly one for a normal viewer document,
 * - the devtools exclusion proof (S0-09), which is the only thing standing
 *   between a development diagnostic and the image a customer runs,
 * - the customer image matrix (S0-11, R-53/AC-17/AC-18/AC-19): the development
 *   and explicitly-empty images start on fresh disposable databases, the empty
 *   image carries no placeholder package, folder or ledger, and the image
 *   history and filesystem carry only MODULE_INCLUDE. A missing Docker daemon
 *   fails these cases rather than skipping them.
 * - the build-input exclusion proof (Spec 0 AC-5/AC-24, `pg4`): the builder
 *   stage prunes unselected module folders, refuses an unset selection, and an
 *   import of an excluded module fails the build.
 *
 * The validator and its case shape are core's, shared through
 * `@genie/core/testing/required-tests-validator`, so the app harness keeps only
 * the manifest that is its own.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/rpc-unauthenticated.integration.test.ts",
    reason:
      "S2-09 review S2 requires the app-owned routes to refuse a limited break-glass session, with only the two clearing endpoints answering",
    cases: [
      "the RPC answer for an unauthenticated request refuses a limited break-glass session on every app-owned route except the two clearing endpoints (R-30, S2)",
    ],
  },
  {
    file: "testing/modules-rpc.integration.test.ts",
    reason:
      "Bead 4xz and Spec 3 Decision 9 require the enable refusals to reach the RPC body with their status and issues through the one transport seam",
    cases: [
      "the modules RPC refusals answers each module refusal with its code, its status and, for an invalid config, its issues",
      "the modules RPC refusals refuses a caller without core:settings:manage at 403 even with a malformed body",
    ],
  },
  {
    file: "testing/settings-rpc.integration.test.ts",
    reason:
      "Spec 3 R-79 and R-93 require a refused settings save to reach the RPC body with settings-invalid and its issues, behind the core:settings:manage gate",
    cases: [
      "the settings RPC refusals answers an invalid save with settings-invalid at 400 and the field issues",
      "the settings RPC refusals refuses a caller with a module admin key alone at 403",
    ],
  },
  {
    file: "testing/isolation.integration.test.ts",
    cases: [
      "two tenant contexts in one process each TenantContext reader, file store and placeholder router returns only its own database's data",
      "two tenant contexts in one process the two databases are genuinely separate",
      "two tenant contexts in one process the two-context isolation test each context holds its own Better Auth instance and neither answers for the other",
    ],
  },
  {
    file: "testing/image.startup.test.ts",
    cases: [
      "the built image runs the worker entrypoint from the built image and migrates a fresh database",
      "the built image blocks every request-bound path while migrations are still running",
      "the built image exits nonzero and never answers when the migration lock times out",
      "the built image exits nonzero for malformed configuration without connecting",
      "the built image shares one context across concurrent page, RPC and viewer requests",
      "the built image runs genie-ops migrate on a fresh database through the image entrypoint",
      "the built image serves no migration SQL url",
      "the built image migrates the real database from the repository SQL",
      "the running Section 1 image processes opens one server-counted pool for the app, worker and migrate command",
      "the running Section 1 image processes redacts planted secrets and tenant-tags JSON output from app, worker and every genie-ops command",
      "the running Section 1 image processes redacts the framework's console lines with core's redactor and filters them by LOG_LEVEL",
    ],
  },
  {
    file: "testing/prune-public-migration-sql.test.ts",
    cases: [
      "the prune-public-migration-sql tool prunes a public migration sql that is byte-identical to a server asset",
      "the prune-public-migration-sql tool fails and preserves everything when public sql bytes match a server asset",
      "the prune-public-migration-sql tool fails and preserves everything when standalone public sql bytes match a server asset",
      "the prune-public-migration-sql tool rejects static sql with no byte-identical server asset and deletes nothing",
      "the prune-public-migration-sql tool rejects authored sql under public and deletes nothing",
      "the prune-public-migration-sql tool throws when the build output is missing or malformed",
      "the prune-public-migration-sql tool throws when the standalone tree has zero or multiple server.js roots",
      "the prune-public-migration-sql tool succeeds as a no-op when the build contains no migration sql",
      "the prune-public-migration-sql tool ignores sql under node_modules outside the served outputs",
      "the prune-public-migration-sql tool treats node_modules inside served static as served bytes",
      "the prune-public-migration-sql tool collects uppercase sql spellings",
      "the prune-public-migration-sql tool unlinks only the collected files and preserves server bytes",
      "the prune-public-migration-sql tool fails closed on symlinks under served outputs and preserves link and target",
      "the prune-public-migration-sql tool fails closed when build roots are symlinked",
      "the prune-public-migration-sql tool the cli exits 0 on success and 1 on validation failure",
    ],
  },
  {
    file: "testing/devtools-exclusion.test.ts",
    cases: [
      "the production build and the devtools reads a real build, so an empty scan cannot pass",
      "the production build and the devtools finds application code by the same search, so the method works",
      "the production build and the devtools ships no executable code carrying hideUntilHover",
      "the production build and the devtools ships no executable code carrying TanStack Pacer",
      "the production build and the devtools ships no executable code carrying TanStack Form",
      "the production build and the devtools ships no executable code carrying No user is signed in. Section 0 has no identity yet.",
      "the production build and the devtools ships no executable code carrying deploymentDiagnostics",
      "the production build and the devtools installs no devtools package in the image it runs from",
    ],
  },
  {
    file: "testing/font-build.test.ts",
    reason:
      "Spec 3 AC-1 requires the build to ship only the two self-hosted faces and no third-party font URL",
    cases: [
      "the production build and the fonts reads a real build, so an empty scan cannot pass",
      "the production build and the fonts ships the latin and latin-ext files of the default face and the mono face, and no other font file",
      "the production build and the fonts points every stylesheet url at a file inside the image",
    ],
  },
  {
    file: "testing/image-matrix.integration.test.ts",
    cases: RELEASE_MATRIX_FULL_NAMES,
  },
  {
    file: "testing/image-prune.integration.test.ts",
    cases: [
      "the builder-stage module prune keeps the selected module and removes every other module folder, as the build log shows",
      "the builder-stage module prune refuses an unset MODULE_INCLUDE",
      "the builder-stage module prune fails the build on a direct import of an excluded module",
      "the builder-stage module prune fails the build on a subpath import of an excluded module",
    ],
  },
  {
    file: "testing/viewer-background.integration.test.ts",
    cases: [
      "the viewer URL a normal viewer document invokes the frame origin provider exactly once",
      "the viewer URL an RSC request at the viewer URL invokes no provider",
      "the viewer URL a next-router-prefetch request at the viewer URL invokes no provider",
      "the viewer URL a purpose-prefetch request at the viewer URL invokes no provider",
    ],
  },
  {
    file: "testing/disabled-module.integration.test.ts",
    cases: [
      "compiled disabled module refusal a compiled disabled module hides navigation refuses RPC and routes and keeps its tables",
    ],
  },
  {
    file: "testing/module-parallel.integration.test.ts",
    cases: [
      "module procedures in two parallel calls answers the enabled module call while refusing only the disabled module call",
    ],
  },
  {
    file: "testing/setup-gate.integration.test.ts",
    cases: [
      "the setup gate reports degraded health with the standard security headers before setup",
      "the setup gate serves public and Next static files before setup",
      "the setup gate refuses RPC calls before setup with exactly 503 and standard security headers",
      "the setup gate refuses static-looking RPC and inbound API paths before setup",
      "the setup gate renders the not-set-up page for a module document before setup",
      "the setup gate refuses authentication routes before setup",
      "the setup gate refuses inbound module endpoints before setup",
      "the setup gate renders the standalone not-set-up page on all three document routes",
      "the setup gate gates asset-looking dynamic paths without exposing the catalogue",
      "the setup gate rewrites an unhandled Next path without serializing the application catalogue",
      "the setup gate omits the not-set-up page body from RSC and prefetch requests",
      "the setup gate refuses an API request with an RSC header before setup",
      "the setup gate answers a generic 503 when reading the setup gate fails",
      "the setup gate opens after both known steps are done and serves the same routes normally",
      "the setup gate keeps the proxy gate open after the setup-step table is unavailable",
      "the setup gate does not let a slow pending read close the gate after a later read opens it",
      "the setup gate ignores a client-supplied setup-required header after setup",
      "the setup gate does not expose the setup-required route after setup",
      "health database availability answers 503 within the timeout while a health query is blocked on the database",
      "health database availability checks the database on each call and answers 503 after the database stops",
    ],
  },
  {
    file: "testing/generated-stack.integration.test.ts",
    cases: [
      "the generated customer stack smoke answers degraded health and serves the not-set-up page before setup",
      "the generated customer stack smoke brings the worker to healthy and Keycloak to serve in production mode",
      "the generated customer stack smoke runs genie-ops setup in the running stack, clears the page and answers ok",
      "the generated customer stack smoke serves the customer page and health while the excluded placeholder module is absent",
    ],
  },
  {
    file: "testing/generated-stack-wait.integration.test.ts",
    cases: [
      "the generated-stack readiness wait fails at once, with state and logs, once the container has exited",
      "the generated-stack readiness wait reports a timeout with the still-running container's state and logs",
    ],
  },
];
