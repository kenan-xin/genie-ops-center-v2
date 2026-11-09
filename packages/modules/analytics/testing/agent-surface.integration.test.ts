import {
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ANALYTICS_SURFACE } from "../src/agent-surface.ts";
import { analyticsModule } from "../src/module.ts";
import { insertDashboard } from "./factories.ts";

/**
 * The Dashboards agent surface's `createRecord` against a real Postgres (Spec 7 R-42b, S7-42): it
 * makes the empty dashboard inside the handoff's transaction, so a refusal or a rollback leaves none.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([analyticsModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["analytics"]);
  registerModuleRuntime(deployment.context, [analyticsModule]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

const EDITOR = ["analytics:use", "analytics:read", "analytics:write"];

async function personWith(
  permissions: readonly string[]
): Promise<ModuleRequestContext> {
  const tenant = deployment.context;

  const { userId } = await insertPersonWith(tenant, permissions);

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [analyticsModule],
      userId,
      authenticated: true,
    }),
  };
}

/** Each dashboard of the person whose name matches, in any case: panels, version, Undo, audit. */
async function dashboardsNamed(userId: string, name: string) {
  const { rows } = await deployment.context.db.$client.query(
    `select name, jsonb_array_length(config->'panels') as panels, version,
       jsonb_array_length(undo) as undo,
       (select coalesce(array_agg(action), '{}') from audit_event where target_id = dashboard.id::text) as audit
     from dashboard where owner_user_id = $1 and lower(btrim(name)) = lower($2)`,
    [userId, name]
  );

  return rows;
}

describe("the Dashboards agent surface", () => {
  it("createRecord makes an empty dashboard named by the title in the given transaction, at version 1 with no Undo entry and one created audit row, and a rolled back transaction leaves none", async () => {
    const owner = await personWith(EDITOR);

    await withTransaction(deployment.context, (tx) =>
      ANALYTICS_SURFACE.createRecord(owner, tx, { title: "Collections" })
    );

    expect(await dashboardsNamed(owner.caller.userId, "Collections")).toEqual([
      {
        name: "Collections",
        panels: 0,
        version: 1,
        undo: 0,
        audit: ["analytics:dashboard-created"],
      },
    ]);

    await expect(
      withTransaction(deployment.context, async (tx) => {
        await ANALYTICS_SURFACE.createRecord(owner, tx, {
          title: "Rolled back",
        });

        throw new Error("the handoff failed after the dashboard");
      })
    ).rejects.toThrow("the handoff failed after the dashboard");

    expect(await dashboardsNamed(owner.caller.userId, "Rolled back")).toEqual(
      []
    );
  });

  it("createRecord refuses a name the person already uses with dashboard-name-taken, and the handoff's transaction saves nothing", async () => {
    const owner = await personWith(EDITOR);

    await insertDashboard(deployment.context, {
      ownerUserId: owner.caller.userId,
      name: "Receivables",
    });

    await expect(
      withTransaction(deployment.context, (tx) =>
        ANALYTICS_SURFACE.createRecord(owner, tx, { title: " receivables " })
      )
    ).rejects.toMatchObject({ code: "analytics:dashboard-name-taken" });

    expect(await dashboardsNamed(owner.caller.userId, "Receivables")).toEqual([
      expect.objectContaining({ name: "Receivables" }),
    ]);
  });

  it("createRecord refuses a person without analytics:write and makes nothing", async () => {
    const reader = await personWith(["analytics:use", "analytics:read"]);

    await expect(
      withTransaction(deployment.context, (tx) =>
        ANALYTICS_SURFACE.createRecord(reader, tx, { title: "Reader's" })
      )
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await dashboardsNamed(reader.caller.userId, "Reader's")).toEqual([]);
  });
});
