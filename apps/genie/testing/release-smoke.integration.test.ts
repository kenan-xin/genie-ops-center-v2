import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  REQUIRED_HEADERS,
  pollHealth,
  requireDocker,
  startImage,
} from "./image-process.ts";

/**
 * The smoke the release wrappers run on the exact candidate they built.
 *
 * The candidate is the immutable identity the build resolved, passed as
 * `GENIE_SMOKE_IMAGE`. There is no default and no skip: a release that cannot
 * name its candidate, or cannot reach Docker, fails here before any publish.
 */
const candidate = process.env.GENIE_SMOKE_IMAGE;

if (candidate === undefined || candidate.trim() === "") {
  throw new Error(
    "GENIE_SMOKE_IMAGE must name the built candidate identity. The release wrappers set it from `docker image inspect`; nothing may publish without this smoke."
  );
}

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
    } finally {
      await image.stop();
    }
  }, 240000);
});
