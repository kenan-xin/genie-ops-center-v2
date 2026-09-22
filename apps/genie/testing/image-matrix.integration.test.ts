import { startDisposableDeployment } from "@genie/core/testing";
import { beforeAll, describe, expect, it } from "vitest";

import {
  REQUIRED_HEADERS,
  argNamesInHistory,
  buildImageWith,
  collectImagePublicCorpus,
  dockerHistory,
  imageFilePaths,
  pollHealth,
  requireDocker,
  scanCorpusForMigrationSql,
  startImage,
} from "./image-process.ts";
import { scanFiles, scanHistory } from "./image-scan.ts";
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

const BASE_IMAGE = "node:26-alpine";

describe(RELEASE_MATRIX_DESCRIBE, () => {
  let baseArgs: readonly string[] = [];

  beforeAll(async () => {
    await requireDocker();

    baseArgs = argNamesInHistory(await dockerHistory(BASE_IMAGE));
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

          // No placeholder migration file travels in the image filesystem.
          const files = await imageFilePaths(image.id);

          expect(
            files.filter(({ path }) => path.includes("placeholder"))
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

          const history = await dockerHistory(image.id);

          expect(
            scanHistory(history, { ignoreArgs: baseArgs }).filter(
              ({ kind }) => kind === "build-argument"
            )
          ).toEqual([]);

          expect(
            scanHistory(history).filter(({ kind }) => kind === "secret")
          ).toEqual([]);

          const files = await imageFilePaths(image.id);

          // The control: the included module really is present, so the clean
          // exclusion scan below is not the scanner matching nothing.
          expect(files.some(({ path }) => path.includes("placeholder"))).toBe(
            true
          );

          // Publicly served migration SQL must not travel (F2).
          const corpus = await collectImagePublicCorpus(
            image.id,
            "http://127.0.0.1:3424"
          );

          expect(scanCorpusForMigrationSql(corpus)).toEqual([]);

          // No development-only tooling or secret on the filesystem. Content is
          // empty here by design: the corpus scan above reads the served bytes.
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
