import { readFileSync } from "node:fs";
import { join } from "node:path";

import { startDisposableDeployment } from "@genie/core/testing";
import { beforeAll, describe, expect, it } from "vitest";

import {
  REQUIRED_HEADERS,
  WORKSPACE_ROOT,
  argNamesInHistory,
  buildImageWith,
  collectImageFilesystem,
  collectImagePublicCorpus,
  dockerHistory,
  imageFilePaths,
  pollHealth,
  requireDocker,
  scanCorpusForMigrationSql,
  startImage,
} from "./image-process.ts";
import {
  declaredBuildArguments,
  scanFiles,
  scanHistory,
} from "./image-scan.ts";
import {
  RELEASE_MATRIX_CASES,
  RELEASE_MATRIX_DESCRIBE,
} from "./release-matrix-cases.ts";

/**
 * The customer image matrix of R-53 and AC-17/AC-18/AC-19/AC-53.
 *
 * This is the one proof the customer image contract has, so it fails closed: a
 * missing Docker daemon throws a named diagnostic in `beforeAll` and every case
 * is red, never skipped.
 *
 * The selection is the placeholder module for the development image and an
 * explicit empty list for the customer image. That is exactly what "excluded
 * modules have no routes, tables or migration files, and the placeholder page
 * does not render" needs: the one module that ships is the one excluded, so the
 * placeholder is what proves the exclusion. Docker's content-addressed cache
 * makes each build cheap after the first run.
 */

const DEVELOPMENT_IMAGE = "genie-s011:development";

const EMPTY_IMAGE = "genie-s011:empty";

/** The Dockerfile's own declared arguments, R-32's authority. */
const DECLARED_ARGUMENTS = declaredBuildArguments(
  readFileSync(join(WORKSPACE_ROOT, "deploy/Dockerfile"), "utf8")
);

describe(RELEASE_MATRIX_DESCRIBE, () => {
  beforeAll(async () => {
    await requireDocker();
  }, 120000);

  it(
    RELEASE_MATRIX_CASES.development,
    async () => {
      expect(
        await buildImageWith("placeholder", DEVELOPMENT_IMAGE),
        `could not build ${DEVELOPMENT_IMAGE}`
      ).toBe(true);

      const database = await startDisposableDeployment([]);

      try {
        const image = await startImage(
          {
            DATABASE_URL: database.context.env.databaseUrl,
            PUBLIC_URL: "https://example.invalid",
          },
          3420,
          DEVELOPMENT_IMAGE
        );

        try {
          const observations = await pollHealth(3420);

          expect(observations.some(({ status }) => status === 200)).toBe(true);

          const health = await fetch("http://127.0.0.1:3420/api/health");

          expect(health.status).toBe(200);
          expect(await health.text()).toBe("ok");

          for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
            expect(health.headers.get(key), `health ${key}`).toBe(value);
          }

          // The placeholder route is a rendered document with the standard
          // headers. Its workspace entry requires `placeholder:use`, and the
          // Section 0 stub grants only `placeholder:read`, so the documented
          // Section 0 result is the denial body, not the module's own content.
          const page = await fetch("http://127.0.0.1:3420/placeholder");

          expect(page.status).toBe(200);
          expect(page.headers.get("content-type")).toContain("text/html");
          expect(page.headers.get("content-security-policy")).toBe(
            REQUIRED_HEADERS["content-security-policy"]
          );
          expect(await page.text()).toContain(
            'data-testid="permission-denied"'
          );

          // The viewer is the placeholder page whose content does render under the
          // stub, and it is the R-49 fixture.
          const viewer = await fetch(
            "http://127.0.0.1:3420/viewer/placeholder"
          );

          expect(viewer.status).toBe(200);
          expect(await viewer.text()).toContain("Placeholder viewer");
        } finally {
          await image.stop();
        }
      } finally {
        await database.stop();
      }
    },
    900000
  );

  it(
    RELEASE_MATRIX_CASES.emptySelection,
    async () => {
      expect(
        await buildImageWith("", EMPTY_IMAGE),
        `could not build ${EMPTY_IMAGE}`
      ).toBe(true);

      const database = await startDisposableDeployment([]);

      try {
        const image = await startImage(
          {
            DATABASE_URL: database.context.env.databaseUrl,
            PUBLIC_URL: "https://example.invalid",
          },
          3421,
          EMPTY_IMAGE
        );

        try {
          const observations = await pollHealth(3421);

          expect(observations.some(({ status }) => status === 200)).toBe(true);

          const health = await fetch("http://127.0.0.1:3421/api/health");

          expect(health.status).toBe(200);
          expect(await health.text()).toBe("ok");
          expect(health.headers.get("content-security-policy")).toBe(
            REQUIRED_HEADERS["content-security-policy"]
          );

          // The placeholder route does not exist in an image built without it.
          const page = await fetch("http://127.0.0.1:3421/placeholder", {
            redirect: "manual",
          });

          expect(page.status).toBe(404);

          // Only core history was applied: no placeholder table and no placeholder
          // ledger, on a database the image migrated itself.
          const tables = await database.context.db.$client.query<{
            table_name: string;
          }>("select table_name from information_schema.tables");

          const names = tables.rows.map((row) => row.table_name);

          expect(names).not.toContain("placeholder_record");
          expect(names).not.toContain("__drizzle_migrations_placeholder");

          // The excluded module's package, folder and ledger are absent from the
          // image. The bare word "placeholder" is not the needle: the app owns a
          // `/placeholder` dispatch route that always compiles, and it is the
          // 404 above — not a path check — that proves no module route answers.
          const files = await imageFilePaths(image.id);

          const moduleArtifacts = files.filter(
            ({ path }) =>
              path.includes("@genie/module-placeholder") ||
              path.includes("packages/modules/placeholder/") ||
              path.includes("__drizzle_migrations_placeholder")
          );

          expect(moduleArtifacts).toEqual([]);
        } finally {
          await image.stop();
        }
      } finally {
        await database.stop();
      }
    },
    900000
  );

  it(
    RELEASE_MATRIX_CASES.twoSelections,
    async () => {
      // Both images exist from the cases above, but this case builds and starts
      // each on its own fresh database so the "two selections start" property
      // stands on its own rather than borrowing another case's evidence.
      expect(await buildImageWith("placeholder", DEVELOPMENT_IMAGE)).toBe(true);
      expect(await buildImageWith("", EMPTY_IMAGE)).toBe(true);

      // Sequential by definition: each iteration starts, health-checks and stops
      // its own image on its own database, so running them together would mix the
      // two selections' evidence.
      /* eslint-disable no-await-in-loop */
      for (const [tag, port] of [
        [DEVELOPMENT_IMAGE, 3422],
        [EMPTY_IMAGE, 3423],
      ] as const) {
        const database = await startDisposableDeployment([]);

        try {
          const image = await startImage(
            {
              DATABASE_URL: database.context.env.databaseUrl,
              PUBLIC_URL: "https://example.invalid",
            },
            port,
            tag
          );

          try {
            const observations = await pollHealth(port);

            expect(
              observations.some(({ status }) => status === 200),
              `${tag} did not become healthy`
            ).toBe(true);
          } finally {
            await image.stop();
          }
        } finally {
          await database.stop();
        }
      }
      /* eslint-enable no-await-in-loop */
    },
    900000
  );

  it(
    RELEASE_MATRIX_CASES.content,
    async () => {
      expect(await buildImageWith("placeholder", DEVELOPMENT_IMAGE)).toBe(true);

      const database = await startDisposableDeployment([]);

      try {
        const image = await startImage(
          {
            DATABASE_URL: database.context.env.databaseUrl,
            PUBLIC_URL: "https://example.invalid",
          },
          3424,
          DEVELOPMENT_IMAGE
        );

        try {
          await pollHealth(3424);

          // History is an image property; the container id would not resolve.
          const history = await dockerHistory(DEVELOPMENT_IMAGE);

          // Our Dockerfile declares one build argument, and the built image's
          // history carries no other argument of ours. Base-image arguments and
          // BuildKit metadata are derived from the history as "every ARG this
          // Dockerfile does not declare", so no base image needs to be pulled.
          expect(DECLARED_ARGUMENTS).toEqual(["MODULE_INCLUDE"]);

          const inherited = argNamesInHistory(history).filter(
            (name) => !DECLARED_ARGUMENTS.includes(name)
          );

          expect(
            scanHistory(history, { ignoreArgs: inherited }).filter(
              ({ kind }) => kind === "build-argument"
            )
          ).toEqual([]);

          expect(
            scanHistory(history).filter(({ kind }) => kind === "secret")
          ).toEqual([]);

          const files = await collectImageFilesystem(image.id);

          // The inventory is real, not an empty walk: the standalone server
          // entry is present with non-empty content, so the content rules below
          // are not running over an empty corpus. The scanner's own non-vacuity
          // control (it finds an included module when one is excluded) is proved
          // in image-scan.test.ts.
          const server = files.find(({ path }) => path.endsWith("server.js"));

          expect(server).toBeDefined();
          expect((server?.content ?? "").length).toBeGreaterThan(0);

          // Publicly served migration SQL must not travel (F2). This uses the
          // bytes the image serves; the filesystem scan below uses the bytes it
          // holds, so the two are independent.
          const corpus = await collectImagePublicCorpus(
            image.id,
            "http://127.0.0.1:3424"
          );

          expect(scanCorpusForMigrationSql(corpus)).toEqual([]);

          // No development-only tooling, publicly served migration file or
          // secret in the filesystem, over the real file bytes.
          const findings = scanFiles(files, {
            includedModules: ["placeholder"],
            excludedModules: [],
          });

          expect(
            findings.filter(({ kind }) =>
              ["dev-tooling", "migration-file", "secret"].includes(kind)
            )
          ).toEqual([]);
        } finally {
          await image.stop();
        }
      } finally {
        await database.stop();
      }
    },
    900000
  );
});
