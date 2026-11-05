import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  SUMMARY_INSTRUCTIONS,
  SUMMARY_PREFIX,
} from "../src/services/agent/compaction.ts";
import {
  appendMessage,
  createOwnSession,
  handleAgentChat,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  CORE_MODEL_RECORDINGS,
  type DisposableDeployment,
  agentRequest,
  insertPersonWith,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "./index.ts";

/**
 * The compaction of a long chat (S7-34, `czjw.80`) against a real Postgres and the recorded model:
 * what each model request holds, what the session stores, and the audit row of the summary call.
 */
let deployment: DisposableDeployment;

let recorded: ReturnType<typeof useRecordedModel>;

const MODEL = "openai/gpt-6.1-terra";

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);
  await writeModelConnection(deployment.context, {
    allowed: [MODEL, "anthropic/claude-opus-5.5"],
    chat: MODEL,
    document: "anthropic/claude-opus-5.5",
    reportingDate: "2026-10-27",
  });
  recorded = useRecordedModel(deployment.context, CORE_MODEL_RECORDINGS);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function asker(): Promise<ModuleRequestContext> {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, ["core:ask:use"]);

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

/** A chat of `turns` stored questions and answers: "<word> question i" and "<word> answer i". */
async function storedChat(
  ctx: ModuleRequestContext,
  word: string,
  turns: number
): Promise<string> {
  const id = randomUUID();

  await createOwnSession(ctx, { id, title: `${word} chat`, modelId: MODEL });

  for (let i = 1; i <= turns; i++) {
    // oxlint-disable-next-line no-await-in-loop -- the order is the point
    await appendMessage(ctx, id, {
      role: "user",
      parts: [{ type: "text", text: `${word} question ${i}` }],
    });
    // oxlint-disable-next-line no-await-in-loop -- the order is the point
    await appendMessage(ctx, id, {
      role: "assistant",
      parts: [{ type: "text", text: `${word} answer ${i}` }],
    });
  }

  return id;
}

/** One turn: the reply, the requests the model got, and what the route logged. */
async function ask(ctx: ModuleRequestContext, sessionId: string, text: string) {
  const before = recorded.sent.length;
  const logged: unknown[] = [];

  const reply = await readAgentReply(
    await handleAgentChat(
      ctx,
      agentRequest({
        sessionId,
        message: {
          id: "client-message-1",
          role: "user",
          parts: [{ type: "text", text }],
        },
      }),
      { logError: (cause) => logged.push(cause) }
    )
  );

  return {
    reply,
    logged,
    requests: recorded.sent
      .slice(before)
      .map(({ body }) => messagesOf(chatBody.parse(body))),
  };
}

// A system text arrives as text parts, every other message as a string.
const textContent = z.union([
  z.string(),
  z
    .array(z.object({ type: z.literal("text"), text: z.string() }))
    .transform((parts) => parts.map((part) => part.text).join("")),
]);

const chatBody = z.object({
  messages: z.array(z.object({ role: z.string(), content: textContent })),
});

/** Each message of a request as "role: text". */
function messagesOf(body: z.infer<typeof chatBody>): readonly string[] {
  return body.messages.map(({ role, content }) => `${role}: ${content}`);
}

const turnLines = (word: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => [
    `user: ${word} question ${from + i}`,
    `assistant: ${word} answer ${from + i}`,
  ]).flat();

const summaryLine = (summary: string) =>
  `user: ${SUMMARY_PREFIX}\n\n${summary}`;

async function sessionRow(id: string) {
  const { rows } = await deployment.context.db.$client.query<{
    summary: string | null;
    summary_through_seq: string | null;
    last_input_tokens: number | null;
  }>(
    "select summary, summary_through_seq, last_input_tokens from agent_session where id = $1",
    [id]
  );

  return rows[0];
}

async function seqOf(sessionId: string, index: number): Promise<number> {
  const { rows } = await deployment.context.db.$client.query<{ seq: string }>(
    "select seq from agent_message where session_id = $1 order by seq",
    [sessionId]
  );

  return Number(rows[index]?.seq);
}

async function summaryAudits(sessionId: string) {
  const { rows } = await deployment.context.db.$client.query<{
    metadata: unknown;
  }>(
    "select metadata from audit_event where action = 'core:agent_tool_called' and metadata->>'sessionId' = $1 and metadata->>'tool' = 'summarize-chat' order by occurred_at, id",
    [sessionId]
  );

  return rows.map(({ metadata }) => metadata);
}

describe("the compaction of a long chat", () => {
  it("sends a stored summary and the recent messages in place of the earlier ones, and keeps the summary for the next turn", async () => {
    const ctx = await asker();
    const id = await storedChat(ctx, "Question", 20);

    const first = await ask(ctx, id, "Question question 21");

    expect(first.logged).toEqual([]);
    expect(first.requests).toHaveLength(2);

    const [summarize, answer] = first.requests;

    // The 32 messages before the last 10 that open on a question: turns 1 to 16.
    expect(summarize).toEqual([
      `system: ${SUMMARY_INSTRUCTIONS}`,
      `user: ${[
        "Messages:",
        ...Array.from({ length: 16 }, (_, i) => [
          `Person: Question question ${i + 1}`,
          `Assistant: Question answer ${i + 1}`,
        ]).flat(),
      ].join("\n")}`,
    ]);

    const stored = await sessionRow(id);
    const through = await seqOf(id, 31);
    const summary = stored?.summary ?? "";

    expect(summary).not.toBe("");
    expect(Number(stored?.summary_through_seq)).toBe(through);
    expect(answer?.slice(1)).toEqual([
      summaryLine(summary),
      ...turnLines("Question", 17, 20),
      "user: Question question 21",
    ]);
    expect(first.reply.chunks).toContainEqual({
      type: "data-summary",
      data: { throughMessageId: expect.any(String), summary },
      transient: true,
    });

    const audits = await summaryAudits(id);

    expect(audits).toEqual([
      {
        sessionId: id,
        tool: "summarize-chat",
        dataset: null,
        query: { messages: 32, throughSeq: through },
        rowCount: 32,
        outcome: "answered",
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain(summary);

    const answered = first.reply.message?.parts.flatMap((part) =>
      part.type === "text" ? [part.text] : []
    );

    const next = await ask(ctx, id, "Question question 22");

    expect(next.requests).toHaveLength(1);
    expect(next.requests[0]?.slice(1)).toEqual([
      summaryLine(summary),
      ...turnLines("Question", 17, 20),
      "user: Question question 21",
      `assistant: ${answered?.join("")}`,
      "user: Question question 22",
    ]);
  });

  it("summarizes after a turn whose input reached the token limit, and keeps only the new question", async () => {
    const ctx = await asker();
    const id = await storedChat(ctx, "Token", 1);

    const large = await ask(ctx, id, "Token question 2");

    expect(large.requests).toHaveLength(1);
    expect((await sessionRow(id))?.last_input_tokens).toBe(70_000);

    const next = await ask(ctx, id, "Token question 3");

    expect(next.requests).toHaveLength(2);

    const summary = (await sessionRow(id))?.summary ?? "";

    expect(next.requests[1]?.slice(1)).toEqual([
      summaryLine(summary),
      "user: Token question 3",
    ]);
  });

  it("answers from the recent messages when the summary call fails, and stores no summary", async () => {
    const ctx = await asker();
    const id = await storedChat(ctx, "Fallback", 20);

    const turn = await ask(ctx, id, "Fallback question 21");

    expect(turn.logged).toHaveLength(1);
    expect(turn.requests).toHaveLength(2);
    // The plain window: the last 40 messages from a question, so turn 1 is left out.
    expect(turn.requests[1]?.slice(1)).toEqual([
      ...turnLines("Fallback", 2, 20),
      "user: Fallback question 21",
    ]);
    expect(turn.reply.message?.parts).toContainEqual(
      expect.objectContaining({ type: "text" })
    );
    expect((await sessionRow(id))?.summary).toBeNull();
    expect(await summaryAudits(id)).toMatchObject([{ outcome: "failed" }]);
  });
});
