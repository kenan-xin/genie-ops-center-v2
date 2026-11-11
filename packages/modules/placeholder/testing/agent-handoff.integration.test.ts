import { randomUUID } from "node:crypto";

import {
  agentToolSet,
  type AgentMessage,
  appendMessage,
  artifactTurn,
  chatLabels,
  createOwnSession,
  handleAgentChat,
  listOwnArtifacts,
  type ModuleRequestContext,
  offersWriteTool,
  principalFor,
  readAuditPage,
  readOwnSession,
  registerModuleRuntime,
  startRun,
  withTransaction,
} from "@genie/core";
import { startedHandoff } from "@genie/core/features/agent";
import {
  agentRequest,
  enableModules,
  insertAgentSession,
  insertPersonWith,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { insertPlaceholderRecord } from "./factories.ts";
import { PLACEHOLDER_AGENT_RECORDINGS } from "./index.ts";
import { placeholderWithSurface, REFUSED_TITLE } from "./test-surface.ts";

/**
 * The Ask handoff on the placeholder's test surface (Spec 7 R-42b, S7-41), with the recordings
 * `handoff-*` and `surface-chat-*`: one `hand-over` call makes the record, the target session with
 * the brief, the audit row and the run in one transaction, or saves nothing.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const MODULES = [placeholderWithSurface];

const RUN_MODEL = "anthropic/claude-opus-5.5";

const HANDOFF_ASK =
  "Hand this over: build a placeholder review of October for the board.";

const REFUSED_ASK = "Hand this over: build the refused placeholder review.";

/** The title of the recorded `hand-over` call, the model's choice (P16-55). */
const BRIEF_TITLE = "October 2026 board review";

const SURFACE_CHAT_ASK = "Add a first step to this record.";

/** Answered by `synthetic-handoff-parallel-1`: two `hand-over` calls in one step (P16d-5). */
const PARALLEL_ASK = "Hand this table over twice as a parallel board review.";

const PARALLEL_TITLE = "Parallel board review";

const TABLE = {
  type: "table",
  title: "October records",
  series: [
    {
      name: "Records",
      dataset: "placeholder.records",
      query: { select: ["label"] },
    },
  ],
} as const;

const errors: unknown[] = [];

const hooks = { logError: (cause: unknown) => errors.push(cause) };

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", RUN_MODEL],
    chat: "openai/gpt-6.1-terra",
    document: RUN_MODEL,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
  recorded = useRecordedModel(deployment.context, PLACEHOLDER_AGENT_RECORDINGS);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function person(
  keys: readonly string[] = [
    "core:ask:use",
    "placeholder:use",
    "placeholder:read",
  ]
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, keys);

  const tenant = deployment.context;

  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

/** An Ask chat that holds the same two messages in every test, so its first request is shared. */
async function askChatWithTable(ctx: ModuleRequestContext): Promise<string> {
  const sessionId = randomUUID();

  await createOwnSession(ctx, {
    id: sessionId,
    title: "October records",
    modelId: RUN_MODEL,
  });
  await appendMessage(ctx, sessionId, {
    role: "user",
    parts: [{ type: "text", text: "Show the October records as a table." }],
  });
  await appendMessage(
    ctx,
    sessionId,
    {
      id: randomUUID(),
      role: "assistant",
      // The make-artifact call as a chat stores it, so the model sees the table it may pass on.
      parts: [
        {
          type: "tool-make-artifact",
          toolCallId: "call_table",
          state: "output-available",
          input: { config: TABLE },
          output: { artifact: 1, version: 1, title: TABLE.title },
        },
        { type: "text", text: "Here are the October records." },
      ],
    },
    [
      {
        toolCallId: "call_table",
        artifactId: randomUUID(),
        number: 1,
        isNew: true,
        kind: "table",
        title: TABLE.title,
        version: 1,
        definition: TABLE,
      },
    ]
  );

  return sessionId;
}

function message(text: string) {
  return {
    id: "client-message",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

async function ask(ctx: ModuleRequestContext, sessionId: string, text: string) {
  await readAgentReply(
    await handleAgentChat(
      ctx,
      agentRequest({ sessionId, modelId: RUN_MODEL, message: message(text) }),
      hooks
    )
  );
}

const SESSION_ROWS = z.array(
  z.object({
    id: z.string(),
    surface: z.string(),
    record_id: z.string().nullable(),
    handed_from_session_id: z.string().nullable(),
    title: z.string(),
    model_id: z.string(),
    run_state: z.string().nullable(),
    run_error: z.string().nullable(),
    run_job_id: z.string().nullable(),
  })
);

async function sessionsOf(ctx: ModuleRequestContext) {
  const { rows } = await deployment.context.db.execute(
    sql`select id, surface, record_id, handed_from_session_id, title, model_id, run_state, run_error, run_job_id from agent_session where user_id = ${ctx.caller.userId} order by created_at`
  );

  return SESSION_ROWS.parse(rows);
}

async function recordsLabelled(label: string) {
  const { rows } = await deployment.context.db.execute(
    sql`select id from placeholder_record where label = ${label}`
  );

  return z.array(z.object({ id: z.string() })).parse(rows);
}

async function runJob(jobId: string) {
  const { rows } = await deployment.context.db.execute(
    sql`select name, data from pgboss.job where id = ${jobId}`
  );

  return rows[0];
}

/** The run jobs of the person's sessions. */
async function runJobsOf(ctx: ModuleRequestContext) {
  const { rows } = await deployment.context.db.execute(
    sql`select job.id from pgboss.job job join agent_session session on session.id::text = job.data->>'sessionId' where job.name = 'core.agent-run' and session.user_id = ${ctx.caller.userId}`
  );

  return rows;
}

/** The person's agent tool rows, newest first, read by an auditor through the audit reader. */
async function toolRows(actorId: string) {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:audit:read",
  ]);

  const page = await readAuditPage({
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
    modules: MODULES,
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

async function lastAnswer(ctx: ModuleRequestContext, sessionId: string) {
  const { messages } = await readOwnSession(ctx, sessionId);

  return messages.at(-1);
}

function partsOf(stored: AgentMessage | undefined, type: string) {
  return (stored?.parts ?? []).filter((part) => part.type === type);
}

/** The tool names and the system text of a sent request, parsed at the transport's boundary. */
const SENT = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
  tools: z.array(z.object({ function: z.object({ name: z.string() }) })),
});

describe("the Ask handoff on the placeholder test surface", () => {
  it("a handoff creates the record, the session, the audit row and the link, and starts the run", async () => {
    const ctx = await person();
    const askId = await askChatWithTable(ctx);
    const before = recorded.sent.length;

    await ask(ctx, askId, HANDOFF_ASK);

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);

    const first = SENT.parse(recorded.sent[before]?.body);

    expect({
      tools: first.tools.map(({ function: { name } }) => name),
      writeRule: JSON.stringify(first.messages[0]?.content).includes(
        "Some tools change data."
      ),
    }).toEqual({
      tools: [
        "list-datasets",
        "query-dataset",
        "open-record",
        "offer-choices",
        "make-artifact",
        "make-file",
        "hand-over",
        "placeholder-count-records",
      ],
      writeRule: true,
    });

    const [record] = await recordsLabelled(BRIEF_TITLE);
    const [, target] = await sessionsOf(ctx);

    expect(target).toMatchObject({
      surface: "placeholder",
      record_id: record?.id,
      handed_from_session_id: askId,
      title: BRIEF_TITLE,
      model_id: RUN_MODEL,
      run_state: "queued",
      run_error: null,
    });
    expect(await runJob(target?.run_job_id ?? "")).toMatchObject({
      name: "core.agent-run",
      data: { sessionId: target?.id, runJobId: target?.run_job_id },
    });

    const { messages } = await readOwnSession(ctx, target?.id ?? "");
    const [brief, text] = messages[0]?.parts ?? [];

    expect({ count: messages.length, role: messages[0]?.role }).toEqual({
      count: 1,
      role: "user",
    });
    expect(brief).toMatchObject({
      type: "data-brief",
      data: { title: BRIEF_TITLE, charts: [TABLE.title] },
    });
    // The stored config, as Postgres keeps it, is what the target reads.
    const [artifact] = await listOwnArtifacts(ctx, askId);

    expect(text?.type === "text" ? text.text : "").toContain(
      `- ${TABLE.title}: ${JSON.stringify(artifact?.versions[0]?.definition)}`
    );
    expect(text?.type === "text" ? text.text : "").toContain(
      "- The rest of the Ask chat"
    );
    // The live chat also reads and fixes its table first; those calls are the model's choice.
    expect(
      (await toolRows(ctx.caller.userId)).filter(
        ({ metadata }) => metadata?.["tool"] === "hand-over"
      )
    ).toMatchObject([
      {
        metadata: {
          tool: "hand-over",
          outcome: "handed-over",
          sessionId: askId,
          targetSessionId: target?.id,
        },
      },
    ]);

    const answer = await lastAnswer(ctx, askId);

    expect({
      card: partsOf(answer, "data-handoff").map((part) =>
        "data" in part ? part.data : undefined
      ),
      output: partsOf(answer, "tool-hand-over").map((part) =>
        "output" in part ? part.output : undefined
      ),
    }).toEqual({
      card: [
        {
          sessionId: target?.id,
          title: BRIEF_TITLE,
          agentName: "Placeholder agent",
          address: `/placeholder/${record?.id}`,
        },
      ],
      output: [{ handedTo: "Placeholder agent", title: BRIEF_TITLE }],
    });
  });

  it("offers hand-over only to a holder of the surface's key", async () => {
    const sessionId = randomUUID();

    const handOver = async (ctx: ModuleRequestContext) =>
      Object.keys(
        await agentToolSet(ctx, { id: sessionId }, artifactTurn(sessionId, 0))
      ).includes("hand-over");

    const reader = await person(["core:ask:use", "placeholder:read"]);

    expect({
      reader: await handOver(reader),
      readerWriteRule: await offersWriteTool(reader),
      writer: await handOver(await person()),
    }).toEqual({ reader: false, readerWriteRule: false, writer: true });
  });

  it("a refused createRecord saves nothing", async () => {
    const ctx = await person();
    const askId = randomUUID();
    const before = recorded.sent.length;

    await ask(ctx, askId, REFUSED_ASK);

    expect(errors).toEqual([]);

    const answer = await lastAnswer(ctx, askId);
    const rows = await toolRows(ctx.caller.userId);

    expect({
      sessions: (await sessionsOf(ctx)).map(({ id }) => id),
      records: await recordsLabelled(REFUSED_TITLE),
      jobs: await runJobsOf(ctx),
      // The reads before the hand-over are the model's choice, so the hand-over rows count, and
      // any later request may carry the refusal back to the model.
      audit: rows
        .map(({ metadata }) => metadata)
        .filter((metadata) => metadata?.["tool"] === "hand-over"),
      cards: partsOf(answer, "data-handoff"),
      toolError: recorded.sent
        .slice(before + 1)
        .some(({ body }) =>
          JSON.stringify(body).includes("You may not do that.")
        ),
    }).toMatchObject({
      sessions: [askId],
      records: [],
      jobs: [],
      audit: [{ tool: "hand-over", outcome: "forbidden" }],
      cards: [],
      toolError: true,
    });
    expect(rows[0]?.metadata).not.toHaveProperty("targetSessionId");
  });

  it("a new chat on a record page is a session of that surface with the surface's tools", async () => {
    const ctx = await person();

    const record = await insertPlaceholderRecord(deployment.context, {
      label: "Chat record",
    });

    const sessionId = randomUUID();

    const before = recorded.sent.length;

    await readAgentReply(
      await handleAgentChat(
        ctx,
        agentRequest({
          sessionId,
          modelId: RUN_MODEL,
          message: message(SURFACE_CHAT_ASK),
          surface: { id: "placeholder", recordId: record.id },
        }),
        hooks
      )
    );

    expect(errors).toEqual([]);

    const tools = SENT.parse(recorded.sent[before]?.body).tools.map(
      ({ function: { name } }) => name
    );

    expect({
      session: (await sessionsOf(ctx)).map(({ surface, record_id }) => ({
        surface,
        record_id,
      })),
      step: tools.includes("placeholder-surface-step"),
      askOnly: tools.filter(
        (name) => name === "make-file" || name === "hand-over"
      ),
    }).toEqual({
      session: [{ surface: "placeholder", record_id: record.id }],
      step: true,
      askOnly: [],
    });

    await expect(
      handleAgentChat(
        ctx,
        agentRequest({
          sessionId: randomUUID(),
          message: message(SURFACE_CHAT_ASK),
          surface: { id: "nope", recordId: record.id },
        }),
        hooks
      )
    ).rejects.toMatchObject({ code: "module-disabled" });
    expect(await sessionsOf(ctx)).toHaveLength(1);
  });

  it("the chat labels hold the surface tool's step words", async () => {
    expect(
      (await chatLabels(await person())).labels.steps[
        "placeholder-surface-step"
      ]
    ).toEqual({
      active: "Noting a step",
      done: "Noted a step",
      failed: "Could not note a step",
    });
  });

  it("a second handoff while one builds answers with the first one's card", async () => {
    const ctx = await person();

    const firstRecord = await insertPlaceholderRecord(deployment.context, {
      label: "First record",
    });

    const building = await insertAgentSession(deployment.context, {
      userId: ctx.caller.userId,
      surface: "placeholder",
      recordId: firstRecord.id,
      title: "First record",
      modelId: RUN_MODEL,
    });

    await withTransaction(deployment.context, async (tx) =>
      startRun(ctx, tx, building.id)
    );

    const recordsBefore = (await recordsLabelled(BRIEF_TITLE)).length;
    const askId = await askChatWithTable(ctx);

    await ask(ctx, askId, HANDOFF_ASK);

    expect(errors).toEqual([]);

    const answer = await lastAnswer(ctx, askId);
    const sessions = await sessionsOf(ctx);

    // The live model calls hand-over once more after the refusal (Phase 16, R1). The answer still
    // shows one card.
    const handOvers = (await toolRows(ctx.caller.userId))
      .map(({ metadata }) => metadata)
      .filter((metadata) => metadata?.["tool"] === "hand-over");

    const calls = partsOf(answer, "tool-hand-over").map((part) =>
      "state" in part ? part.state : undefined
    );

    const cards = partsOf(answer, "data-handoff").map((part) =>
      "data" in part ? part.data : undefined
    );

    expect({
      sessions: sessions.map(({ id }) => id),
      records: (await recordsLabelled(BRIEF_TITLE)).length,
      building: sessions[0]?.run_state,
      outcomes: [...new Set(handOvers.map((row) => row?.["outcome"]))],
      calls: [...new Set(calls)],
      cards,
    }).toEqual({
      sessions: [building.id, askId],
      records: recordsBefore,
      building: "queued",
      outcomes: ["agent-run-active"],
      calls: ["output-error"],
      cards: [
        {
          sessionId: building.id,
          title: "First record",
          agentName: "Placeholder agent",
          address: `/placeholder/${firstRecord.id}`,
        },
      ],
    });
  });

  it("two hand-over calls in one step make one record and show one card, the card of the call that ran", async () => {
    const ctx = await person();
    const askId = await askChatWithTable(ctx);

    await ask(ctx, askId, PARALLEL_ASK);

    expect(errors).toEqual([]);

    const [, handed] = await sessionsOf(ctx);
    const answer = await lastAnswer(ctx, askId);

    const cards = partsOf(answer, "data-handoff").map((part) =>
      "data" in part ? part.data : undefined
    );

    expect({
      records: (await recordsLabelled(PARALLEL_TITLE)).length,
      sessions: (await sessionsOf(ctx)).length,
      outcomes: (await toolRows(ctx.caller.userId))
        .map(({ metadata }) => metadata)
        .filter((metadata) => metadata?.["tool"] === "hand-over")
        .map((metadata) => metadata?.["outcome"])
        .toSorted(),
      cards,
    }).toEqual({
      records: 1,
      sessions: 2,
      outcomes: ["agent-run-active", "handed-over"],
      cards: [expect.objectContaining({ sessionId: handed?.id })],
    });
    expect(answer && startedHandoff(answer)).toEqual(cards[0]);
  });
});
