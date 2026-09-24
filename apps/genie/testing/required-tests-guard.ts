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
 *   image renders no placeholder route or table, and the image history and
 *   filesystem carry only MODULE_INCLUDE. A missing Docker daemon fails these
 *   cases rather than skipping them.
 * - the build-input exclusion proof (Spec 0 AC-5/AC-24, `pg4`): the builder
 *   stage prunes unselected module folders, refuses an unset selection, fails
 *   on a stray folder, and an import of an excluded module fails the build.
 *
 * The validator and its case shape are core's, shared through
 * `@genie/core/testing/required-tests-validator`, so the app harness keeps only
 * the manifest that is its own.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/isolation.integration.test.ts",
    cases: [
      "two tenant contexts in one process each read returns only its own database's row",
      "two tenant contexts in one process the two databases are genuinely separate",
    ],
  },
  {
    file: "testing/image.startup.test.ts",
    cases: [
      "the built image shares one context across concurrent page, tRPC and viewer requests",
      "the built image runs genie-ops from PATH through docker exec and migrates",
      "the built image runs genie-ops migrate on a fresh database through the image entrypoint",
      "the built image serves no migration SQL url",
      "the built image exposes no migration SQL content in its public corpus",
      "the built image detects the repository migration SQL in a public corpus, raw, JSON-escaped and base64 encoded, and only that SQL",
      "the built image fails closed when a migration SQL file is empty",
      "the built image rejects symlinked public corpus entries with a named diagnostic",
      "the built image migrates the real database from the repository SQL",
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
    file: "testing/image-matrix.integration.test.ts",
    cases: RELEASE_MATRIX_FULL_NAMES,
  },
  {
    file: "testing/image-prune.integration.test.ts",
    cases: [
      "the builder-stage module prune keeps the selected module and removes every other module folder, as the build log shows",
      "the builder-stage module prune prunes every module folder for an explicitly empty selection although the app depends on placeholder",
      "the builder-stage module prune refuses an unset MODULE_INCLUDE",
      "the builder-stage module prune fails the build when a folder the selection does not name remains",
      "the builder-stage module prune resolves a direct and a subpath import of a selected module",
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
      "compiled disabled module refusal a compiled disabled module hides navigation refuses tRPC and routes and keeps its tables",
    ],
  },
  {
    file: "testing/setup-gate.integration.test.ts",
    cases: [
      "the setup gate reports degraded health with the standard security headers before setup",
      "the setup gate serves public and Next static files before setup",
      "the setup gate refuses tRPC calls before setup with exactly 503 and standard security headers",
      "the setup gate refuses static-looking tRPC and inbound API paths before setup",
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
];
