import { randomUUID } from "node:crypto";

import {
  type AgentMessage,
  handleAgentChat,
  type ModuleRequestContext,
  principalFor,
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
  "root = Answer([intro, records])",
  'intro = Paragraph("I answer questions about the records you may read, as of the reporting date.")',
  'records = Chart({type: "kpi", title: "Placeholder records", series: [{name: "Records", dataset: "placeholder.records", query: {aggregates: [{fn: "count", as: "records"}]}, value: "records"}]})',
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

async function reader(): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:ask:use",
    "placeholder:read",
  ]);

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
});
