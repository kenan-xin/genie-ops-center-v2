import { readFileSync } from "node:fs";
import { join } from "node:path";

import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  REQUIRED_HEADERS,
  WORKSPACE_ROOT,
  argNamesInHistory,
  collectImageFilesystem,
  dockerHistory,
  pollHealth,
  requireDocker,
  startImage,
} from "./image-process.ts";
import {
  declaredBuildArguments,
  scanFiles,
  scanHistory,
} from "./image-scan.ts";

/**
 * The smoke the release wrappers run on the exact candidate they built.
 *
 * The candidate is the immutable identity the build resolved, passed as
 * `GENIE_SMOKE_IMAGE`, with the effective selection in `GENIE_SMOKE_INCLUDE`.
 * The smoke runs the full R-53 customer-image proof against that candidate
 * itself: health and headers, the excluded modules' routes, tables and ledgers,
 * and the history and filesystem confidentiality scan with the real excluded
 * set. A leak that only exists in the selected candidate therefore blocks the
 * publish, not just the separately built development image.
 *
 * There is no default and no skip: a release that cannot name its candidate, or
 * cannot reach Docker, fails here before any publish.
 */
const candidate = process.env.GENIE_SMOKE_IMAGE;

if (candidate === undefined || candidate.trim() === "") {
  throw new Error(
    "GENIE_SMOKE_IMAGE must name the built candidate identity. The release wrappers set it from `docker image inspect`; nothing may publish without this smoke."
  );
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

/** The effective selection and its complement, set by the release pipeline. */
const included = list(process.env.GENIE_SMOKE_INCLUDE);

const excluded = list(process.env.GENIE_SMOKE_EXCLUDED);

/** The Dockerfile's own declared arguments, R-32's authority. */
const DECLARED_ARGUMENTS = declaredBuildArguments(
  readFileSync(join(WORKSPACE_ROOT, "deploy/Dockerfile"), "utf8")
);

describe("the release candidate smoke", () => {
  let database: Awaited<ReturnType<typeof startDisposableDeployment>>;

  beforeAll(async () => {
    await requireDocker();
    database = await startDisposableDeployment([]);
  }, 180000);

  afterAll(async () => {
    await database?.stop();
  });

  it("boots the candidate on a fresh database and serves health and headers", async () => {
    const image = await startImage(
      {
        DATABASE_URL: database.context.env.databaseUrl,
        PUBLIC_URL: "https://example.invalid",
      },
      3430,
      candidate
    );

    try {
      const observations = await pollHealth(3430);

      expect(
        observations.some(({ status }) => status === 200),
        `candidate ${candidate} never became healthy`
      ).toBe(true);

      const health = await fetch("http://127.0.0.1:3430/api/health");

      expect(health.status).toBe(200);
      expect(await health.text()).toBe("ok");

      for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
        expect(health.headers.get(key), `health ${key}`).toBe(value);
      }

      // R-53: the candidate excludes every module it did not select — no route,
      // no table and no migration ledger for any of them. Sequential: each probe
      // is asserted against the same contract, not raced.
      /* eslint-disable no-await-in-loop */
      for (const id of excluded) {
        for (const path of [`/m/${id}`, `/admin/m/${id}`]) {
          const response = await fetch(`http://127.0.0.1:3430${path}`, {
            redirect: "manual",
          });

          expect(response.status, `${path} answered for excluded ${id}`).toBe(
            404
          );
        }
      }
      /* eslint-enable no-await-in-loop */

      const tables = await database.context.db.$client.query<{
        table_name: string;
      }>("select table_name from information_schema.tables");

      const names = tables.rows.map((row) => row.table_name);

      for (const id of excluded) {
        expect(
          names.filter((name) => name.startsWith(`${id}_`)),
          `a table of excluded ${id} exists`
        ).toEqual([]);
        expect(names).not.toContain(`__drizzle_migrations_${id}`);
      }
    } finally {
      await image.stop();
    }
  }, 240000);

  it("carries only MODULE_INCLUDE, and no excluded module or secret, on the candidate", async () => {
    const image = await startImage(
      {
        DATABASE_URL: database.context.env.databaseUrl,
        PUBLIC_URL: "https://example.invalid",
      },
      3431,
      candidate
    );

    try {
      await pollHealth(3431);

      expect(DECLARED_ARGUMENTS).toEqual(["MODULE_INCLUDE"]);

      const history = await dockerHistory(candidate);

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

      expect(files.some(({ path }) => path.endsWith("server.js"))).toBe(true);

      const findings = scanFiles(files, {
        includedModules: included,
        excludedModules: excluded,
      });

      expect(findings).toEqual([]);
    } finally {
      await image.stop();
    }
  }, 240000);
});
