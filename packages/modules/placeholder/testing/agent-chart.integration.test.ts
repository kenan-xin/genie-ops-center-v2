import {
  callProcedure,
  createAgentRouter,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * A records table of an answer opens each row's record (Spec 7 R-44, S7-11 D3), against a real
 * Postgres with the real histories applied. The agent's `chart` procedure resolves each row
 * through the record route as the viewer, and the key column is not drawn.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function agentFor(permissions: readonly string[]) {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, permissions);

  return callProcedure(createAgentRouter(), {
    tenant,
    caller: principalFor({
      tenant,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
    requestId: "req-agent-chart",
  });
}

describe("the agent chart on placeholder.records", () => {
  it("the agent's chart of a records table opens each row for a person who may open it", async () => {
    const [first, second] = await Promise.all(
      ["agent-chart A", "agent-chart B"].map((label) =>
        insertPlaceholderRecord(deployment.context, {
          label,
          recordedOn: "2026-01-01",
        })
      )
    );

    const config = {
      type: "table",
      title: "Records",
      series: [
        {
          name: "Records",
          dataset: "placeholder.records",
          query: {
            select: ["id", "label", "currency", "amountCents"],
            filters: [
              {
                field: "label",
                op: "in",
                values: ["agent-chart A", "agent-chart B"],
              },
            ],
            orderBy: [{ column: "label", direction: "asc" }],
          },
        },
      ],
    };

    const read = ["core:ask:use", "placeholder:read"];

    const cases = [
      {
        permissions: [...read, "placeholder:use"],
        paths: [`/placeholder/${first?.id}`, `/placeholder/${second?.id}`],
      },
      { permissions: read, paths: [null, null] },
    ];

    const answers = await Promise.all(
      cases.map(async ({ permissions }) => {
        const { data } = await (await agentFor(permissions)).chart({ config });

        return {
          columns: data.columns.map(({ key }) => key),
          idInRows: data.rows.some((row) => "id" in row),
          paths: data.recordPaths,
        };
      })
    );

    expect(answers).toEqual(
      cases.map(({ paths }) => ({
        columns: ["label", "currency", "amountCents"],
        idInRows: false,
        paths,
      }))
    );
  });

  it("keeps the key column of a records table that selects nothing else", async () => {
    const record = await insertPlaceholderRecord(deployment.context, {
      label: "agent-chart only id",
      recordedOn: "2026-01-01",
    });

    const config = {
      type: "table",
      title: "Records",
      series: [
        {
          name: "Records",
          dataset: "placeholder.records",
          query: {
            select: ["id"],
            filters: [{ field: "id", op: "eq", value: record?.id }],
          },
        },
      ],
    };

    const agent = await agentFor([
      "core:ask:use",
      "placeholder:read",
      "placeholder:use",
    ]);

    const { data } = await agent.chart({ config });

    expect({
      columns: data.columns.map(({ key }) => key),
      rows: data.rows,
      paths: data.recordPaths,
    }).toEqual({
      columns: ["id"],
      rows: [{ id: record?.id }],
      paths: [`/placeholder/${record?.id}`],
    });
  });
});
