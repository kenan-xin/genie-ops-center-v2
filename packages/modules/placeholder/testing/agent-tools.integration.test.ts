import { randomUUID } from "node:crypto";

import {
  agentToolSet,
  artifactTool,
  artifactTurn,
  type ArtifactCardPart,
  type ArtifactTurn,
  createOwnSession,
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

import { recordsDataset } from "../src/datasets.ts";
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
  input: AgentToolValue,
  sessionId = SESSION_ID
): Promise<AgentToolValue> {
  const execute = (
    await agentToolSet(ctx, { id: sessionId }, artifactTurn(sessionId, 0))
  )[name]?.execute;

  if (execute === undefined) throw new Error(`No tool "${name}".`);

  return execute(input, {
    toolCallId: `call-${name}`,
    messages: [],
    context: {},
  });
}

const selectIds = { dataset: RECORDS, query: { select: ["id"] } };

const barConfig = {
  type: "bar",
  title: "Quantity by record",
  series: [
    {
      name: "Quantity",
      dataset: RECORDS,
      query: {
        groupBy: [{ field: "label" }],
        aggregates: [{ fn: "sum", field: "quantity", as: "total" }],
      },
      x: "label",
      y: "total",
    },
  ],
} as const;

const lineConfig = {
  type: "line",
  title: "Quantity by day",
  series: [
    {
      name: "Quantity",
      dataset: RECORDS,
      query: {
        groupBy: [{ field: "recordedOn" }],
        aggregates: [{ fn: "sum", field: "quantity", as: "total" }],
      },
      x: "recordedOn",
      y: "total",
    },
  ],
} as const;

const tableConfig = {
  type: "table",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: RECORDS,
      query: { select: ["label", "quantity"] },
    },
  ],
} as const;

/** A turn whose card parts land in `written`, as the route's stream writer would take them. */
function recordingTurn(storedCount: number) {
  const written: ArtifactCardPart[] = [];

  const turn: ArtifactTurn = {
    ...artifactTurn(SESSION_ID, storedCount),
    write: (part) => {
      written.push(part);
    },
  };

  return { turn, written };
}

/** Runs `make-artifact` as the AI SDK would, after it parsed the input. */
async function makeArtifact(
  ctx: ModuleRequestContext,
  turn: ArtifactTurn,
  input: AgentToolValue,
  toolCallId = "call-make-artifact"
): Promise<AgentToolValue> {
  const { execute } = artifactTool(ctx, { id: SESSION_ID }, turn);

  if (execute === undefined) throw new Error("No execute.");

  return execute(input, { toolCallId, messages: [], context: {} });
}

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
    tools: Object.keys(
      await agentToolSet(ctx, { id: SESSION_ID }, artifactTurn(SESSION_ID, 0))
    ),
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

  it("leaves an agent-hidden field out of list-datasets and still answers it to a query", async () => {
    const { quantity } = recordsDataset.fields;

    if (quantity === undefined) throw new Error("No quantity field.");

    const hidden = {
      ...placeholderModule,
      datasets: [
        {
          ...recordsDataset,
          fields: {
            ...recordsDataset.fields,
            quantity: { ...quantity, hiddenFromAgent: true as const },
          },
        },
      ],
    };

    const tenant = createTenantContext(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: deployment.context.env.publicUrl,
      },
      { error: () => {}, info: () => {}, debug: () => {} },
      ["placeholder"]
    );

    registerModuleRuntime(tenant, [hidden]);

    try {
      const ctx: ModuleRequestContext = {
        tenant,
        caller: principalFor({
          tenant,
          modules: [hidden],
          userId: await reader(),
          authenticated: true,
        }),
      };

      const { datasets } = z
        .object({
          datasets: z.array(
            z.object({
              name: z.string(),
              fields: z.record(z.string(), z.unknown()),
            })
          ),
        })
        .parse(await call(ctx, "list-datasets", {}));

      const listed = Object.keys(
        datasets.find(({ name }) => name === RECORDS)?.fields ?? {}
      );

      expect(listed).toContain("amountCents");
      expect(listed).not.toContain("quantity");

      const { rows } = z
        .object({ rows: z.array(z.object({ quantity: z.number() })) })
        .parse(
          await call(ctx, "query-dataset", {
            dataset: RECORDS,
            query: { select: ["id", "quantity"] },
          })
        );

      expect(rows).toHaveLength(AGENT_RECORDS.length);
    } finally {
      await tenant.db.$client.end();
    }
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

  it("makes artifact 1 version 1, and a change makes version 2 of the same artifact, with no id for the model", async () => {
    const ctx = contextFor(await reader());
    const { turn, written } = recordingTurn(0);

    const outputs = [
      await makeArtifact(ctx, turn, { config: barConfig }, "call-1"),
      await makeArtifact(
        ctx,
        turn,
        { artifact: 1, config: lineConfig },
        "call-2"
      ),
    ];

    expect(outputs).toEqual([
      { artifact: 1, version: 1, title: "Quantity by record" },
      { artifact: 1, version: 2, title: "Quantity by day" },
    ]);

    const [first, second] = turn.pending;

    expect(turn.pending).toHaveLength(2);
    expect(second?.artifactId).toBe(first?.artifactId);
    expect(turn.pending.map(({ kind, isNew }) => ({ kind, isNew }))).toEqual([
      { kind: "chart", isNew: true },
      { kind: "chart", isNew: false },
    ]);
    expect(written).toEqual([
      {
        type: "data-artifact",
        id: "call-1",
        data: { artifactId: first?.artifactId, version: 1 },
      },
      {
        type: "data-artifact",
        id: "call-2",
        data: { artifactId: first?.artifactId, version: 2 },
      },
    ]);
    expect(JSON.stringify(outputs)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  });

  it("refuses a change to an artifact number the chat does not have", async () => {
    const person = await reader();
    const { turn } = recordingTurn(0);

    await expect(
      makeArtifact(contextFor(person), turn, { artifact: 5, config: barConfig })
    ).rejects.toThrow("This chat has no artifact 5.");

    expect(turn.pending).toEqual([]);
    expect((await toolRows(person))[0]?.metadata).toMatchObject({
      tool: "make-artifact",
      rowCount: 0,
      outcome: "invalid-input",
    });
  });

  it("refuses a config the chart gate refuses, with the gate's fix", async () => {
    const { turn } = recordingTurn(0);

    await expect(
      makeArtifact(contextFor(await reader()), turn, {
        config: {
          ...barConfig,
          series: [
            {
              ...barConfig.series[0],
              query: {
                groupBy: [{ field: "label" }],
                aggregates: [{ fn: "sum", field: "qty", as: "total" }],
              },
            },
          ],
        },
      })
    ).rejects.toThrow(/qty/);

    expect(turn.pending).toEqual([]);
  });

  it("refuses a change that turns a chart into a table", async () => {
    const ctx = contextFor(await reader());
    const { turn } = recordingTurn(0);

    await makeArtifact(ctx, turn, { config: barConfig });

    await expect(
      makeArtifact(ctx, turn, { artifact: 1, config: tableConfig })
    ).rejects.toThrow(
      "An artifact keeps its kind. Make a new artifact for a table."
    );
    expect(turn.pending).toHaveLength(1);
  });

  it("numbers two new artifacts of one step apart, after the chat's stored ones", async () => {
    let reads = 0;

    // The first read of the dataset waits, so without call order the second call numbers first.
    const slowFirst = {
      ...placeholderModule,
      datasets: [
        {
          ...recordsDataset,
          source: async (...args: Parameters<typeof recordsDataset.source>) => {
            reads += 1;

            if (reads === 1) await new Promise((done) => setTimeout(done, 300));

            return recordsDataset.source(...args);
          },
        },
      ],
    };

    const tenant = createTenantContext(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: deployment.context.env.publicUrl,
      },
      { error: () => {}, info: () => {}, debug: () => {} },
      ["placeholder"]
    );

    registerModuleRuntime(tenant, [slowFirst]);

    const ctx = contextFor(await reader(), tenant);
    const { turn } = recordingTurn(1);

    const outputs = await Promise.all([
      makeArtifact(ctx, turn, { config: barConfig }, "call-a"),
      makeArtifact(ctx, turn, { config: lineConfig }, "call-b"),
    ]);

    expect(
      outputs.map(
        (output) => z.object({ artifact: z.number() }).parse(output).artifact
      )
    ).toEqual([2, 3]);
    expect(turn.pending.map(({ toolCallId }) => toolCallId)).toEqual([
      "call-a",
      "call-b",
    ]);
  });

  it("make-file queues one file job as the person and answers without an id", async () => {
    const person = await reader();
    const ctx = contextFor(person);
    const sessionId = await ownSession(ctx);

    const input = {
      title: "All records",
      format: "xlsx",
      dataset: RECORDS,
      query: { select: ["id", "label"] },
    };

    expect(await call(ctx, "make-file", input, sessionId)).toEqual({
      title: "All records",
      format: "xlsx",
      state: "making",
    });

    const files = await filesOf(sessionId);

    expect(files).toEqual([
      {
        id: expect.any(String),
        tool_call_id: "call-make-file",
        state: "queued",
      },
    ]);

    // The job still waits: no worker runs in this test, so the call did not wait for it.
    expect(await jobsFor(files[0]?.id ?? "")).toEqual([
      {
        state: "created",
        data: { "agentFileId": files[0]?.id, "genie:startedBy": person },
      },
    ]);

    expect((await toolRows(person))[0]?.metadata).toMatchObject({
      sessionId,
      tool: "make-file",
      dataset: RECORDS,
      query: input,
      outcome: "queued",
    });
  });

  it("make-file refuses an unreadable dataset and a bad query, and queues nothing", async () => {
    const outsiderCtx = contextFor(await outsider());
    const readerCtx = contextFor(await reader());

    const refused = [
      {
        ctx: outsiderCtx,
        query: { select: ["id"] },
        text: "You may not do that.",
      },
      {
        ctx: readerCtx,
        query: { select: ["colour"] },
        text: "colour",
      },
    ];

    await Promise.all(
      refused.map(async ({ ctx, query, text }) => {
        const sessionId = await ownSession(ctx);

        await expect(
          call(
            ctx,
            "make-file",
            { title: "Records", format: "csv", dataset: RECORDS, query },
            sessionId
          )
        ).rejects.toThrow(text);

        expect(await filesOf(sessionId)).toEqual([]);
      })
    );

    const { rows } = await deployment.context.db.$client.query(
      "select j.id from pgboss.job j left join agent_file a on a.id::text = j.data->>'agentFileId' where j.name = 'core.agent-file' and a.id is null"
    );

    expect(rows).toEqual([]);
  });
});

describe("make-file when the job queue fails", () => {
  it("leaves no queued file and tells the model it could not run", async () => {
    const person = contextFor(await reader());

    const sessionId = await ownSession(person);

    // A queue that no worker reads: the send throws, as when pg-boss cannot be reached.
    const ctx: ModuleRequestContext = {
      ...person,
      tenant: {
        ...deployment.context,
        jobQueue: {
          enqueue: async () => null,
          schedule: async () => {},
        },
      },
    };

    await expect(
      call(
        ctx,
        "make-file",
        {
          title: "Records",
          format: "csv",
          dataset: RECORDS,
          query: { select: ["id"] },
        },
        sessionId
      )
    ).rejects.toThrow("The tool could not run.");

    expect(await filesOf(sessionId)).toEqual([]);
  });
});

/** A new chat of the person, so a file row has a session to belong to. */
async function ownSession(ctx: ModuleRequestContext): Promise<string> {
  const id = randomUUID();

  await createOwnSession(ctx, { id, title: "Files", modelId: "test-model" });

  return id;
}

async function filesOf(sessionId: string) {
  const { rows } = await deployment.context.db.$client.query<{
    id: string;
    tool_call_id: string;
    state: string;
  }>("select id, tool_call_id, state from agent_file where session_id = $1", [
    sessionId,
  ]);

  return rows;
}

async function jobsFor(agentFileId: string) {
  const { rows } = await deployment.context.db.$client.query<{
    state: string;
    data: AgentToolValue;
  }>(
    "select state, data from pgboss.job where name = 'core.agent-file' and data->>'agentFileId' = $1",
    [agentFileId]
  );

  return rows;
}
