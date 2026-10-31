import {
  agentToolSet,
  createTenantContext,
  moduleInstructionLines,
  principalFor,
  readAuditPage,
  registerModuleRuntime,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import type { AgentToolValue } from "@genie/core/contracts";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertRole,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { placeholderModule } from "../src/module.ts";
import { AGENT_RECORDS, insertAgentRecords } from "./agent-fixtures.ts";

/**
 * The boss agent's read tools on the placeholder (Spec 7 R-43, R-47, AC-8 lines 2 and 3), against a
 * real Postgres with the real histories applied. Every tool runs as the person who asks, and every
 * call writes one audit row without the values it returned.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const SESSION_ID = "00000000-0000-4000-8000-00000000c0de";

const RECORDS = "placeholder.records";

const [ALPHA] = AGENT_RECORDS;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache never holds another date (DEC-46).
  await deployment.context.db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
  await insertAgentRecords(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function contextFor(
  userId: string,
  tenant: TenantContext = deployment.context
): ModuleRequestContext {
  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  };
}

const reader = async () =>
  (
    await insertPersonWith(deployment.context, [
      "core:ask:use",
      "placeholder:read",
    ])
  ).userId;

const outsider = async () =>
  (await insertPersonWith(deployment.context, ["core:ask:use"])).userId;

/** Reads placeholder:read on Alpha only, and holds Ask tenant-wide through a second role. */
async function scopedReader(): Promise<string> {
  const { userId } = await insertPersonWith(
    deployment.context,
    ["placeholder:read"],
    { type: "placeholder-record", id: ALPHA.id }
  );

  const roleId = await insertRole(deployment.context, {
    permissions: ["core:ask:use"],
  });

  await assignRole(deployment.context, {
    roleId,
    principal: { type: "user", id: userId },
  });

  return userId;
}

/** Runs one tool of the person's tool set as the AI SDK would, after it parsed the input. */
async function call(
  ctx: ModuleRequestContext,
  name: string,
  input: AgentToolValue
): Promise<AgentToolValue> {
  const execute = (await agentToolSet(ctx, { id: SESSION_ID }))[name]?.execute;

  if (execute === undefined) throw new Error(`No tool "${name}".`);

  return execute(input, {
    toolCallId: `call-${name}`,
    messages: [],
    context: {},
  });
}

const selectIds = { dataset: RECORDS, query: { select: ["id"] } };

/** The record ids that `query-dataset` answers the person, sorted. */
async function queriedIds(ctx: ModuleRequestContext): Promise<string[]> {
  const { rows } = z
    .object({ rows: z.array(z.object({ id: z.string() })) })
    .parse(await call(ctx, "query-dataset", selectIds));

  return rows.map(({ id }) => id).toSorted();
}

/** The dataset names that `list-datasets` answers the person. */
async function listedNames(ctx: ModuleRequestContext): Promise<string[]> {
  const { datasets } = z
    .object({ datasets: z.array(z.object({ name: z.string() })) })
    .parse(await call(ctx, "list-datasets", {}));

  return datasets.map(({ name }) => name);
}

/** The tool names and dataset names one request offers the person. */
async function offered(ctx: ModuleRequestContext) {
  return {
    tools: Object.keys(await agentToolSet(ctx, { id: SESSION_ID })),
    datasets: await listedNames(ctx),
  };
}

/** The person's agent tool rows, newest first, read by an auditor through the audit reader. */
async function toolRows(actorId: string) {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:audit:read",
  ]);

  const page = await readAuditPage({
    tenant: deployment.context,
    caller: contextFor(userId).caller,
    modules: [placeholderModule],
    filters: {
      query: "",
      actorId,
      action: "core:agent_tool_called",
      targetType: "all",
      range: "custom",
      from: null,
      to: null,
      operatorOnly: false,
    },
    cursor: null,
    limit: 50,
    includeFacets: false,
  });

  return page.events;
}

/** A context of its own, so a changed entitlement is read past the 10 s cache (DEC-46). */
function freshTenant(): TenantContext {
  const tenant = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["placeholder"]
  );

  registerModuleRuntime(tenant, [placeholderModule]);

  return tenant;
}

describe("the agent tools on the placeholder", () => {
  it("answers only the rows inside the asker's scope, from a core and a module tool", async () => {
    const cases = [
      { person: await scopedReader(), ids: [ALPHA.id], records: 1 },
      {
        person: await reader(),
        ids: AGENT_RECORDS.map(({ id }) => id),
        records: 3,
      },
    ];

    const answers = await Promise.all(
      cases.map(async ({ person }) => {
        const ctx = contextFor(person);

        return {
          ids: await queriedIds(ctx),
          count: await call(ctx, "placeholder-count-records", {}),
        };
      })
    );

    expect(answers).toEqual(
      cases.map(({ ids, records }) => ({
        ids,
        count: { records, asOf: "2026-10-27" },
      }))
    );
  });

  it("refuses a person without placeholder:read on every tool", async () => {
    const ctx = contextFor(await outsider());

    expect(await listedNames(ctx)).not.toContain(RECORDS);

    await Promise.all(
      [
        call(ctx, "query-dataset", selectIds),
        call(ctx, "placeholder-count-records", {}),
      ].map((refused) =>
        expect(refused).rejects.toThrow("You may not do that.")
      )
    );

    expect(
      await call(ctx, "open-record", { dataset: RECORDS, id: ALPHA.id })
    ).toEqual({ found: false });
  });

  it("offers the placeholder's tool and dataset only while the module is on", async () => {
    const person = await reader();

    expect(await offered(contextFor(person))).toEqual({
      tools: expect.arrayContaining(["placeholder-count-records"]),
      datasets: expect.arrayContaining([RECORDS]),
    });

    const tenant = freshTenant();

    try {
      await tenant.db.$client.query(
        "update tenant_module set enabled = false where module_id = 'placeholder'"
      );

      const off = await offered(contextFor(person, tenant));

      expect(off.tools).not.toContain("placeholder-count-records");
      expect(off.datasets).not.toContain(RECORDS);
    } finally {
      await tenant.db.$client.end();
      await enableModules(deployment.context, ["placeholder"]);
    }
  });

  it("gives the placeholder's agent rule only to a holder of placeholder:admin while the module is on", async () => {
    const { userId: holder } = await insertPersonWith(deployment.context, [
      "core:ask:use",
      "placeholder:admin",
    ]);

    expect(await moduleInstructionLines(contextFor(holder))).toEqual([
      "Placeholder records are fictional test data. Say so when an answer uses them.",
    ]);
    expect(await moduleInstructionLines(contextFor(await reader()))).toEqual(
      []
    );

    const tenant = freshTenant();

    try {
      await tenant.db.$client.query(
        "update tenant_module set enabled = false where module_id = 'placeholder'"
      );

      expect(await moduleInstructionLines(contextFor(holder, tenant))).toEqual(
        []
      );
    } finally {
      await tenant.db.$client.end();
      await enableModules(deployment.context, ["placeholder"]);
    }
  });

  it("writes one audit row per call with the query and row count, and no returned value", async () => {
    const person = await reader();

    await call(contextFor(person), "query-dataset", selectIds);

    const rows = await toolRows(person);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: { id: person },
      action: "core:agent_tool_called",
      targetType: "dataset",
      targetId: RECORDS,
      summary: `Agent tool query-dataset on ${RECORDS}`,
      metadata: {
        sessionId: SESSION_ID,
        tool: "query-dataset",
        dataset: RECORDS,
        query: selectIds,
        rowCount: 3,
        outcome: "answered",
      },
    });

    const stored = JSON.stringify(rows[0]);

    for (const value of [
      "Alpha",
      "120000",
      ...AGENT_RECORDS.map((r) => r.id),
    ]) {
      expect(stored).not.toContain(value);
    }
  });

  it("writes a refused call's row with outcome forbidden and row count 0", async () => {
    const person = await outsider();

    await expect(
      call(contextFor(person), "query-dataset", selectIds)
    ).rejects.toThrow();

    expect((await toolRows(person))[0]?.metadata).toMatchObject({
      tool: "query-dataset",
      dataset: RECORDS,
      rowCount: 0,
      outcome: "forbidden",
    });
  });

  it("answers an unknown field with the dataset's fix hint and records dataset-query-invalid", async () => {
    const person = await reader();

    await expect(
      call(contextFor(person), "query-dataset", {
        dataset: RECORDS,
        query: { select: ["colour"] },
      })
    ).rejects.toThrow('select.0: Field "colour" is not in the dataset.');

    expect((await toolRows(person))[0]?.metadata).toMatchObject({
      rowCount: 0,
      outcome: "dataset-query-invalid",
    });
  });
});
