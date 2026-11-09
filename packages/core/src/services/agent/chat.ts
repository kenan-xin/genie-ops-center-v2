import { randomUUID } from "node:crypto";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";

import {
  AppError,
  CORE_ERRORS,
  GENERIC_ERROR_CODE,
  safeMessageFor,
} from "../../lib/errors/index.ts";
import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { modelFor } from "../models/index.ts";
import { reportingDate } from "../settings/reporting-date.ts";
import { agentAccess } from "./access.ts";
import { artifactTurn } from "./artifact-tool.ts";
import { storedArtifactCount } from "./artifacts.ts";
import {
  compactionPlan,
  SUMMARIZE_CHAT,
  summarizeChat,
  summaryMessage,
} from "./compaction.ts";
import { CHAT_TITLE_LIMIT } from "./contract.ts";
import { trimHistory } from "./history.ts";
import { moduleInstructionLines } from "./instructions.ts";
import { chatLabels } from "./labels.ts";
import { AGENT_LIMITS } from "./limits.ts";
import {
  type AgentPageContext,
  agentPageContextSchema,
} from "./page-context.ts";
import { agentInstructions } from "./prompt.ts";
import { keptOnStop, STOPPED_PART } from "./stopped-turn.ts";
import {
  type AgentMessage,
  appendMessage,
  createOwnSession,
  findOwnSession,
  readOwnHistory,
  saveSummary,
} from "./store.ts";
import {
  agentToolSet,
  auditRefusedToolCall,
  offeredSessionTools,
  offersWriteTool,
  writeToolAudit,
} from "./tools.ts";

export { AGENT_LIMITS } from "./limits.ts";

// One text part only: chat takes no file upload (R-42).
const chatRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  modelId: z.string().min(1).max(200).optional(),
  message: z.strictObject({
    id: z.string().max(100),
    role: z.literal("user"),
    parts: z.tuple([
      z.strictObject({
        type: z.literal("text"),
        text: z.string().trim().min(1).max(AGENT_LIMITS.messageCharacters),
      }),
    ]),
  }),
  // The page beside the chat, names and ids only (I20). The prompt names it as text.
  context: agentPageContextSchema.optional(),
});

function tooLarge(): AppError {
  return new AppError(CORE_ERRORS["request-too-large"]);
}

async function readChatRequest(request: Request) {
  const declared = request.headers.get("content-length");

  if (declared !== null && Number(declared) > AGENT_LIMITS.requestBytes) {
    throw tooLarge();
  }

  const text = await request.text();

  if (Buffer.byteLength(text) > AGENT_LIMITS.requestBytes) throw tooLarge();

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new AppError(CORE_ERRORS["invalid-input"], { cause });
  }

  const parsed = chatRequestSchema.safeParse(json);

  if (!parsed.success) {
    throw new AppError(CORE_ERRORS["invalid-input"], { cause: parsed.error });
  }

  return parsed.data;
}

/**
 * The text the UI part and the stored message hold for a stream or tool error. A tool refusal
 * keeps its text, which the tool wrapper built from the catalogue message and the fix hints, so
 * the next turn's history still tells the model why (R-41); it is not logged, because a refusal
 * is an answer. Any other error is logged and answers the generic message (R-46).
 */
export function streamErrorText(
  cause: unknown,
  logError: (cause: unknown) => void
): string {
  if (cause instanceof Error && cause.cause instanceof AppError) {
    return cause.message;
  }

  logError(cause);

  return cause instanceof AppError
    ? cause.safeMessage
    : safeMessageFor(GENERIC_ERROR_CODE);
}

/**
 * The boss agent's route (R-40, P8): one person's message to one of their sessions, answered as
 * an AI SDK UI message stream. Every refusal throws its catalogue error before the stream starts
 * and before any write, so the app answers it with `errorResponse`. The first message fixes the
 * session's model (P4); the user message and the answer are stored (R-41).
 */
export async function handleAgentChat(
  ctx: ModuleRequestContext,
  request: Request,
  hooks: { readonly logError: (cause: unknown) => void }
): Promise<Response> {
  if (!ctx.caller.authenticated) {
    throw new AppError(CORE_ERRORS.unauthenticated);
  }

  const access = await agentAccess(ctx);

  if (!access.permitted) throw new AppError(CORE_ERRORS.forbidden);

  if (access.ai !== "on" || access.chatModel === null) {
    throw new AppError(CORE_ERRORS["ai-off"]);
  }

  const { sessionId, modelId, message, context } =
    await readChatRequest(request);

  const existing = await findOwnSession(ctx, sessionId);

  const surface = existing?.surface ?? ASK_SURFACE;

  // Before any write: one answer at a time in a chat (R-42b), and a surface whose module is off
  // stores nothing.
  if (existing !== undefined && existing.runState !== null) {
    throw new AppError(CORE_ERRORS["agent-run-active"]);
  }

  if (surface !== ASK_SURFACE) await offeredSessionTools(ctx, surface);

  const sessionModel = existing?.modelId ?? modelId ?? access.chatModel;

  // Before any write, so a refused model stores nothing (R-18).
  const model = await modelFor(ctx.tenant, {
    task: "chat",
    modelId: sessionModel,
  });

  const [{ text }] = message.parts;

  if (existing === undefined) {
    await createOwnSession(ctx, {
      id: sessionId,
      title: text.replaceAll(/\s+/g, " ").slice(0, CHAT_TITLE_LIMIT),
      modelId: sessionModel,
    });
  }

  await appendMessage(ctx, sessionId, {
    role: "user",
    parts: [{ type: "text", text }],
  });

  // One signal for both model calls: Stop and the turn limit end the summary call too (LC5).
  const abortSignal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(AGENT_LIMITS.turnMs),
  ]);

  const stream = await turnStream(
    ctx,
    { id: sessionId, surface },
    { model, abortSignal, page: context, logError: hooks.logError }
  );

  return createUIMessageStreamResponse({
    // Next's gzip middleware holds a whole event stream until it ends unless the response says
    // no-transform; measured on 2026-11-05: one chunk at the end, against one chunk per event.
    headers: { "cache-control": "no-cache, no-transform" },
    stream,
  });
}

/**
 * One turn of a session after the person's message is stored: the history, the compaction, the
 * model call with the session surface's tools, and the answer as an AI SDK UI message stream that
 * stores the answer when it ends. The agent route and the run job `core.agent-run` share it, so
 * both send the same request for the same session.
 */
export async function turnStream(
  ctx: ModuleRequestContext,
  session: { readonly id: string; readonly surface: string },
  input: {
    readonly model: Awaited<ReturnType<typeof modelFor>>;
    readonly abortSignal: AbortSignal;
    readonly page?: AgentPageContext | undefined;
    readonly logError: (cause: unknown) => void;
    /** Runs in `onEnd`, after the stream ended and before the answer is stored. */
    readonly beforeSave?: () => Promise<void>;
  }
): Promise<ReadableStream<UIMessageChunk>> {
  const { id: sessionId, surface } = session;
  const { model, abortSignal } = input;

  const history = await readOwnHistory(ctx, sessionId);

  const plan = compactionPlan(history);

  let summary = history.summary;

  let sent: readonly AgentMessage[] = trimHistory(
    history.messages.map((entry) => entry.message)
  );

  let summarized: { throughMessageId: string; summary: string } | null = null;

  if (plan.compact) {
    const audit = (outcome: string) =>
      writeToolAudit(
        ctx,
        { id: sessionId },
        {
          tool: SUMMARIZE_CHAT,
          query: { messages: plan.covered.length, throughSeq: plan.throughSeq },
          outcome,
          rowCount: plan.covered.length,
          dataset: null,
        }
      );

    try {
      const { labels } = await chatLabels(ctx);

      const written = await summarizeChat({
        model,
        previous: history.summary,
        covered: plan.covered,
        labels,
        abortSignal,
      });

      await saveSummary(ctx, sessionId, {
        summary: written,
        throughSeq: plan.throughSeq,
      });

      summary = written;
      sent = plan.kept;
      summarized = {
        throughMessageId: plan.throughMessageId,
        summary: written,
      };
      await audit("answered");
    } catch (cause) {
      // A failed summary stores nothing; this turn answers from the plain window, the next tries again (LC6).
      input.logError(cause);
      await audit("failed");
    }
  }

  const turn = artifactTurn(
    sessionId,
    await storedArtifactCount(ctx, sessionId)
  );

  const tools = await agentToolSet(ctx, { id: sessionId, surface }, turn);

  let largestInput = 0;

  const result = streamText({
    model,
    instructions: agentInstructions({
      reportingDate: await reportingDate(ctx.tenant),
      moduleLines: await moduleInstructionLines(ctx, surface),
      writeTools: await offersWriteTool(ctx, surface),
      page: input.page,
    }),
    // A turn cancelled mid-tool stores a call with no result; replaying it would refuse every later turn.
    messages: await convertToModelMessages(
      summary === null ? [...sent] : [summaryMessage(summary), ...sent],
      { tools, ignoreIncompleteToolCalls: true }
    ),
    tools,
    // A call the SDK refuses before `execute` leaves one refused audit row (czjw.31).
    repairToolCall: auditRefusedToolCall(ctx, { id: sessionId }),
    // The summary call takes one of the turn's steps, also when it failed (LC5).
    stopWhen: isStepCount(AGENT_LIMITS.steps - (plan.compact ? 1 : 0)),
    // The largest step input decides the next turn's token trigger; `usage` sums all steps (LC1).
    onStepEnd: ({ usage }) => {
      largestInput = Math.max(largestInput, usage.inputTokens ?? 0);
    },
    maxRetries: 0,
    // A client disconnect stops the model call too; `onEnd` still stores what streamed.
    abortSignal,
  });

  return createUIMessageStream({
    originalMessages: [...sent],
    generateId: () => randomUUID(),
    // The tool writes each artifact's card part into this stream while the answer streams.
    execute: ({ writer }) => {
      // Transient: the chat moves its summary line now, and the stored answer never holds it (LC7).
      if (summarized !== null) {
        writer.write({
          type: "data-summary",
          data: summarized,
          transient: true,
        });
      }

      turn.write = (part) => writer.write(part);
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          tools,
          onError: (error) => streamErrorText(error, input.logError),
        }).pipeThrough(
          // The browser ignores the abort chunk, so a turn that the server aborts (the turn
          // limit) also sends the stopped mark that the store keeps (P03-1).
          new TransformStream({
            transform(chunk, controller) {
              if (chunk.type === "abort") controller.enqueue(STOPPED_PART);

              controller.enqueue(chunk);
            },
          })
        )
      );
    },
    // The library awaits this in the stream's flush, so the response closes after the answer
    // is stored. Stop cancels the stream, the turn limit aborts it: either one stores what
    // finished before it, with a stopped mark (P8, P03-1, P03-2).
    onEnd: async ({ responseMessage, isAborted, isCancelled }) => {
      await input.beforeSave?.();

      if (responseMessage.parts.length === 0) return;

      const { parts, versions } =
        isAborted || isCancelled === true
          ? keptOnStop(responseMessage.parts, turn.pending)
          : { parts: responseMessage.parts, versions: turn.pending };

      // A failed store errors the stream; log it, because no onError sees a flush failure.
      await appendMessage(
        ctx,
        sessionId,
        { id: responseMessage.id, role: "assistant", parts },
        versions,
        largestInput > 0 ? { inputTokens: largestInput } : {}
      ).catch((cause: unknown) => {
        input.logError(cause);

        throw cause;
      });
    },
    onError: (error) => streamErrorText(error, input.logError),
  });
}
