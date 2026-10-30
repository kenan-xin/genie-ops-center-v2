import { randomUUID } from "node:crypto";

import {
  type AgentMessage,
  handleAgentChat,
  type ModuleRequestContext,
  principalFor,
  readAuditPage,
  readOwnSession,
  registerModuleRuntime,
} from "@genie/core";
import {
  agentRequest,
  enableModules,
  insertPersonWith,
  type JsonValue,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { insertAgentRecords } from "./agent-fixtures.ts";
import { PLACEHOLDER_AGENT_RECORDINGS } from "./index.ts";

/**
 * The agent route on the placeholder with the recorded model (Spec 7 R-40, R-41, R-18): the answer
 * streams as AI SDK UI message chunks, the exchange is stored, and a session keeps its model.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let recorded: ReturnType<typeof useRecordedModel>;

const errors: unknown[] = [];

const hooks = { logError: (cause: unknown) => errors.push(cause) };

const WHAT_CAN_YOU_DO = [
  "root = Answer([intro, capabilities, scope])",
  'intro = Paragraph("I can answer questions using workspace records you have permission to read.")',
  'capabilities = List(["Find and summarize records and their fields.", "Calculate counts, totals, averages and other aggregates; filter or group results.", "Present results in charts or tables and find links to record pages."])',
  'scope = Paragraph("Currently, I can access placeholder records, including their labels, dates, amounts, currencies and quantities. Results are as of October 27, 2026. I can’t create or change records.")',
].join("\n");

const RECORDS = "placeholder.records";

/** S1: a tenant-wide reader asks for the count. */
const S1_QUESTION = "How many placeholder records are there?";

const S1_ANSWER = [
  "root = Answer([count])",
  'count = Chart({type: "kpi", title: "Placeholder records", series: [{name: "Records", dataset: "placeholder.records", query: {aggregates: [{fn: "count", as: "record_count"}]}, value: "record_count"}]})',
].join("\n");

/**
 * S3: a person with `core:ask:use` only names the dataset. Live, the model sees no dataset and
 * tries the module's count tool, which refuses. `agent-tools` proves the `query-dataset` refusal.
 */
const S3_QUESTION =
  "How many placeholder records are there? Read placeholder.records.";

const S3_ANSWER = [
  "root = Answer([message])",
  'message = Paragraph("I can’t determine the number of placeholder records because you don’t have access to the count.")',
  // The live answer ends with a line break.
  "",
].join("\n");

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds these values (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
  await insertAgentRecords(deployment.context);
  recorded = useRecordedModel(deployment.context, PLACEHOLDER_AGENT_RECORDINGS);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function reader(
  permissions: readonly string[] = ["core:ask:use", "placeholder:read"]
): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, permissions);

  const tenant = deployment.context;

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

function message(text: string) {
  return {
    id: "client-message",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

async function ask(ctx: ModuleRequestContext, payload: JsonValue) {
  return readAgentReply(
    await handleAgentChat(ctx, agentRequest(payload), hooks)
  );
}

/** The stored answer's tool and text parts in order, without the step boundaries. */
async function storedAnswer(ctx: ModuleRequestContext, sessionId: string) {
  const { messages } = await readOwnSession(ctx, sessionId);

  return messages.at(-1)?.parts.filter(({ type }) => type !== "step-start");
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
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
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

function textOf(stored: AgentMessage): string {
  return stored.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

describe("the agent route on the placeholder", () => {
  it("streams the recorded answer as UI message chunks and stores the exchange under the question", async () => {
    const ctx = await reader();

    const sessionId = randomUUID();

    const reply = await ask(ctx, {
      sessionId,
      message: message("What can you do?"),
    });

    expect(reply.chunks.map(({ type }) => type)).toContain("text-delta");

    const { session, messages } = await readOwnSession(ctx, sessionId);

    expect({
      title: session.title,
      messages: messages.map((stored) => ({
        id: stored.id,
        role: stored.role,
        text: textOf(stored),
      })),
    }).toEqual({
      title: "What can you do?",
      messages: [
        { id: expect.any(String), role: "user", text: "What can you do?" },
        { id: reply.message?.id, role: "assistant", text: WHAT_CAN_YOU_DO },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("sends a later message without a model id to the model the session started with", async () => {
    const ctx = await reader();

    const sessionId = randomUUID();

    await ask(ctx, {
      sessionId,
      modelId: "anthropic/claude-opus-5.5",
      message: message("What can you do?"),
    });

    await ask(ctx, { sessionId, message: message("Thank you.") });

    expect(recorded.sent.at(-1)?.body).toMatchObject({
      model: "anthropic/claude-opus-5.5",
    });
    expect(errors).toEqual([]);
  });

  it("answers a reader's count through list-datasets and query-dataset, stores both results, and audits both calls as the reader", async () => {
    const ctx = await reader();

    const sessionId = randomUUID();

    await ask(ctx, { sessionId, message: message(S1_QUESTION) });

    // First, so a recording miss prints the body the model was sent.
    expect(errors).toEqual([]);
    expect(await storedAnswer(ctx, sessionId)).toMatchObject([
      {
        type: "tool-list-datasets",
        state: "output-available",
        output: {
          datasets: expect.arrayContaining([
            expect.objectContaining({ name: RECORDS }),
          ]),
        },
      },
      {
        type: "tool-query-dataset",
        state: "output-available",
        output: { dataset: RECORDS, rows: [{ record_count: 3 }] },
      },
      { type: "text", text: S1_ANSWER },
    ]);
    expect(await toolRows(ctx.caller.userId)).toMatchObject([
      {
        actor: { id: ctx.caller.userId },
        metadata: { sessionId, tool: "query-dataset", outcome: "answered" },
      },
      {
        actor: { id: ctx.caller.userId },
        metadata: { sessionId, tool: "list-datasets", outcome: "answered" },
      },
    ]);
  });

  it("refuses a module tool inside the stream for a person without placeholder:read, answers the refusal, and audits it as forbidden", async () => {
    const ctx = await reader(["core:ask:use"]);

    const { userId } = ctx.caller;

    const sessionId = randomUUID();

    await ask(ctx, { sessionId, message: message(S3_QUESTION) });

    expect(errors).toEqual([]);
    expect(await storedAnswer(ctx, sessionId)).toMatchObject([
      {
        type: "tool-list-datasets",
        state: "output-available",
        output: { datasets: [] },
      },
      {
        type: "tool-placeholder-count-records",
        state: "output-error",
        errorText: "You may not do that.",
      },
      { type: "text", text: S3_ANSWER },
    ]);
    expect(await toolRows(userId)).toMatchObject([
      {
        actor: { id: userId },
        metadata: {
          sessionId,
          tool: "placeholder-count-records",
          outcome: "forbidden",
        },
      },
      {
        actor: { id: userId },
        metadata: { sessionId, tool: "list-datasets", outcome: "answered" },
      },
    ]);
  });
});
