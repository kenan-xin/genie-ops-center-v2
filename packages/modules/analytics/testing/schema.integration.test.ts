import { randomUUID } from "node:crypto";

import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_DASHBOARD_CONFIG } from "../src/config.ts";
import { analyticsModule } from "../src/module.ts";
import { insertDashboard } from "./factories.ts";

/**
 * The `dashboard` constraints on a real Postgres with the real migration history. Each row is a
 * write the schema itself must refuse, whatever code sends it. No part of the database is mocked.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([analyticsModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

// The owner is a user id by value, with no foreign key (data-shape module rule 2).
const anOwner = () => randomUUID();

describe("the analytics schema", () => {
  it.each([
    [
      "a second dashboard of one owner whose name differs only in case and outer spaces",
      async () => {
        const ownerUserId = anOwner();
        await insertDashboard(t(), { ownerUserId, name: "Receivables" });
        await insertDashboard(t(), { ownerUserId, name: " receivables " });
      },
    ],
    [
      "a blank name",
      () => insertDashboard(t(), { ownerUserId: anOwner(), name: "   " }),
    ],
    [
      "a name of 81 characters",
      () =>
        insertDashboard(t(), { ownerUserId: anOwner(), name: "a".repeat(81) }),
    ],
    [
      "version 0",
      () => insertDashboard(t(), { ownerUserId: anOwner(), version: 0 }),
    ],
    [
      "an undo list of 21 entries",
      () =>
        insertDashboard(t(), {
          ownerUserId: anOwner(),
          undo: Array.from({ length: 21 }, () => ({
            name: "Receivables",
            config: EMPTY_DASHBOARD_CONFIG,
          })),
        }),
    ],
  ])("refuses %s", async (_, write) => {
    await expect(write()).rejects.toThrow();
  });

  it("lets two owners use one dashboard name", async () => {
    await insertDashboard(t(), { ownerUserId: anOwner(), name: "Overview" });

    await expect(
      insertDashboard(t(), { ownerUserId: anOwner(), name: "Overview" })
    ).resolves.toEqual(expect.any(String));
  });
});
