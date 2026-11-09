import { randomUUID } from "node:crypto";

import {
  type AgentMessage,
  appendMessage,
  createOwnSession,
  handleAgentChat,
  listOwnArtifacts,
  type ModuleRequestContext,
  principalFor,
  readAuditPage,
  readOwnSession,
  registerModuleRuntime,
  startRun,
  withTransaction,
} from "@genie/core";
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
 * The Ask handoff on the placeholder's test surface (Spec 7 R-42b, S7-41), with the synthetic
 * fixtures `synthetic-handoff-*`: one `hand-over` call makes the record, the target session with
 * the brief, the audit row and the run in one transaction, or saves nothing.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const MODULES = [placeholderWithSurface];

const RUN_MODEL = "anthropic/claude-opus-5.5";

const HANDOFF_ASK =
  "Hand this over: build a placeholder review of October for the board.";

const REFUSED_ASK = "Hand this over: build the refused placeholder review.";

const BRIEF_TITLE = "October placeholder review";

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

async function person(): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:ask:use",
    "placeholder:use",
    "placeholder:read",
  ]);

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
      parts: [{ type: "text", text: "Here are the October records." }],
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
    expect(await toolRows(ctx.caller.userId)).toMatchObject([
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
      audit: rows.map(({ metadata }) => metadata),
      cards: partsOf(answer, "data-handoff"),
      toolError: JSON.stringify(recorded.sent[before + 1]?.body).includes(
        "You may not do that."
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

    expect({
      sessions: sessions.map(({ id }) => id),
      records: (await recordsLabelled(BRIEF_TITLE)).length,
      building: sessions[0]?.run_state,
      audit: (await toolRows(ctx.caller.userId)).map(
        ({ metadata }) => metadata
      ),
      call: partsOf(answer, "tool-hand-over").map((part) =>
        "state" in part ? part.state : undefined
      ),
      card: partsOf(answer, "data-handoff").map((part) =>
        "data" in part ? part.data : undefined
      ),
    }).toMatchObject({
      sessions: [building.id, askId],
      records: recordsBefore,
      building: "queued",
      audit: [{ tool: "hand-over", outcome: "agent-run-active" }],
      call: ["output-error"],
      card: [
        {
          sessionId: building.id,
          title: "First record",
          agentName: "Placeholder agent",
          address: `/placeholder/${firstRecord.id}`,
        },
      ],
    });
  });
});
