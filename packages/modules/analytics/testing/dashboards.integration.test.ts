import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyticsModule } from "../src/module.ts";
import { analyticsRouter } from "../src/router.ts";
import { insertDashboard } from "./factories.ts";

/**
 * The dashboard procedures against a real Postgres with the real histories applied. The module
 * is enabled, so the cases prove authorization and ownership, not the entitlement refusal. Every
 * caller is a real person whose keys come from a real role assignment.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([analyticsModule]);
  await enableModules(deployment.context, ["analytics"]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function callerAs(userId: string) {
  const context = {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [analyticsModule],
      userId,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext;

  return callProcedure(analyticsRouter, context);
}

describe("the analytics listDashboards procedure", () => {
  it("lists only the caller's own dashboards, the last changed first", async () => {
    const reader = ["analytics:use", "analytics:read"] as const;
    const a = await insertPersonWith(deployment.context, [...reader]);
    const b = await insertPersonWith(deployment.context, [...reader]);

    const a1 = await insertDashboard(deployment.context, {
      ownerUserId: a.userId,
      name: "A1",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });

    const a2 = await insertDashboard(deployment.context, {
      ownerUserId: a.userId,
      name: "A2",
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });

    await insertDashboard(deployment.context, {
      ownerUserId: b.userId,
      name: "B1",
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    });

    expect(await callerAs(a.userId).listDashboards()).toEqual([
      {
        id: a2,
        name: "A2",
        panelCount: 0,
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: a1,
        name: "A1",
        panelCount: 0,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("refuses the list to a person without analytics:read", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "analytics:use",
    ]);

    await insertDashboard(deployment.context, { ownerUserId: userId });

    await expect(callerAs(userId).listDashboards()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
