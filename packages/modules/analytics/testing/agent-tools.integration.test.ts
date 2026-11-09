import {
  agentToolSet,
  artifactTurn,
  ASK_SURFACE,
  moduleInstructionLines,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import type { AgentToolValue } from "@genie/core/contracts";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ANALYTICS_SURFACE } from "../src/agent-surface.ts";
import { ANALYTICS_AGENT_TOOLS } from "../src/agent-tools.ts";
import { analyticsModule } from "../src/module.ts";
import { insertDashboard } from "./factories.ts";

/**
 * The analytics agent tools against a real Postgres (Spec 7 R-46, R-48, R-49): a tool reads and
 * changes only the asker's own dashboards, a changed panel passes the chart gate, and a write
 * tool and its rules reach only a holder of `analytics:write`.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([analyticsModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["analytics"]);
  registerModuleRuntime(deployment.context, [analyticsModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
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

function runTool(
  ctx: ModuleRequestContext,
  name: string,
  input: AgentToolValue
) {
  const found = [...ANALYTICS_AGENT_TOOLS, ...ANALYTICS_SURFACE.tools].find(
    (tool) => tool.name === name
  );

  if (found === undefined) throw new Error(`No tool ${name}.`);

  // SAFETY: each row passes the input its tool's schema accepts.
  return found.run(ctx, input as never);
}

const KPI = {
  type: "kpi",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: "missing.records",
      query: { aggregates: [{ fn: "count", as: "n" }] },
      value: "n",
    },
  ],
} as const;

const rowOf = async (id: string) =>
  (
    await deployment.context.db.$client.query(
      "select name, config, undo, version from dashboard where id = $1",
      [id]
    )
  ).rows[0];

/**
 * The tool names the model gets for a person who may ask with these keys, on Ask or in a
 * Dashboards session, and the module rule count.
 */
async function offered(
  permissions: readonly string[],
  surface: string = ASK_SURFACE
) {
  const ctx = await personWith(["core:ask:use", ...permissions]);

  return {
    tools: Object.keys(
      await agentToolSet(
        ctx,
        { id: "session", surface },
        artifactTurn("session", 0)
      )
    ),
    rules: (await moduleInstructionLines(ctx, surface)).length,
  };
}

describe("the analytics agent tools", () => {
  it.each([
    [
      "analytics-list-dashboards answers no dashboard to another person",
      "other",
      "analytics-list-dashboards",
      () => ({}),
      { output: { dashboards: [] }, rowCount: 0 },
    ],
    [
      "analytics-read-dashboard answers not-found to another person",
      "other",
      "analytics-read-dashboard",
      (id: string) => ({ dashboardId: id }),
      { code: "not-found" },
    ],
    [
      "analytics-change-dashboard answers not-found to another person",
      "other",
      "analytics-change-dashboard",
      (id: string) => ({
        dashboardId: id,
        changes: [{ op: "rename", name: "Taken over" }],
      }),
      { code: "not-found" },
    ],
    [
      "analytics-change-dashboard answers chart-invalid to the owner for a panel on an unknown dataset",
      "owner",
      "analytics-change-dashboard",
      (id: string) => ({
        dashboardId: id,
        changes: [{ op: "add-panel", panel: KPI }],
      }),
      { code: "chart-invalid" },
    ],
  ] as const)(
    "%s and leaves the owner's dashboard the same",
    async (_, who, name, inputOf, expected) => {
      const owner = await personWith(EDITOR);
      const other = await personWith(EDITOR);

      const id = await insertDashboard(deployment.context, {
        ownerUserId: owner.caller.userId,
        name: "Owner's dashboard",
      });

      const before = await rowOf(id);

      // A refusal answers its AppError, whose `code` the row names.
      const answer = await runTool(
        who === "owner" ? owner : other,
        name,
        inputOf(id)
      ).catch((error: Error) => error);

      expect(answer).toMatchObject(expected);
      expect(await rowOf(id)).toEqual(before);
    }
  );

  it("offers the read tools in Ask and the write tools only in a Dashboards session of a writer, with the write rules only there", async () => {
    const core = ["list-datasets", "query-dataset", "open-record"];

    const ask = [...core, "make-artifact", "make-file"];

    const read = ["analytics-list-dashboards", "analytics-read-dashboard"];
    const write = ["analytics-create-dashboard", "analytics-change-dashboard"];

    expect(
      await Promise.all([
        offered(["analytics:use"]),
        offered(["analytics:use", "analytics:read"]),
        offered(EDITOR),
        offered(EDITOR, "analytics"),
      ])
    ).toEqual([
      { tools: ask, rules: 0 },
      { tools: [...ask, ...read], rules: 1 },
      { tools: [...ask, "hand-over", ...read], rules: 1 },
      { tools: [...core, "make-artifact", ...read, ...write], rules: 9 },
    ]);
  });
});
