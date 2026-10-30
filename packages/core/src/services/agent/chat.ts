import { randomUUID } from "node:crypto";

import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";

import {
  AppError,
  CORE_ERRORS,
  GENERIC_ERROR_CODE,
  safeMessageFor,
} from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { modelFor } from "../models/index.ts";
import { reportingDate } from "../settings/reporting-date.ts";
import { agentAccess } from "./access.ts";
import { agentInstructions } from "./prompt.ts";
import {
  appendMessage,
  createOwnSession,
  findOwnSession,
  readOwnSession,
} from "./store.ts";
import { agentToolSet } from "./tools.ts";

/** The route's limits (P8): one bounded turn per request, never retried. */
export const AGENT_LIMITS = {
  requestBytes: 64 * 1024,
  messageCharacters: 4000,
  steps: 6,
  turnMs: 180_000,
} as const;

const TITLE_CHARACTERS = 80;

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

  const { sessionId, modelId, message } = await readChatRequest(request);

  const existing = await findOwnSession(ctx, sessionId);

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
      title: text.replaceAll(/\s+/g, " ").slice(0, TITLE_CHARACTERS),
      modelId: sessionModel,
    });
  }

  await appendMessage(ctx, sessionId, {
    role: "user",
    parts: [{ type: "text", text }],
  });

  // shortcut: the whole session history goes to the model every turn; trim it when the deferred bead's trigger fires.
  const history = [...(await readOwnSession(ctx, sessionId)).messages];

  const tools = await agentToolSet(ctx, { id: sessionId });

  const result = streamText({
    model,
    instructions: agentInstructions({
      reportingDate: await reportingDate(ctx.tenant),
    }),
    messages: await convertToModelMessages(history, { tools }),
    tools,
    stopWhen: isStepCount(AGENT_LIMITS.steps),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(AGENT_LIMITS.turnMs),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: history,
      generateMessageId: () => randomUUID(),
      // The library awaits this in the stream's flush, so the response closes after the answer
      // is stored. A cancelled stream stores what streamed (P8).
      onEnd: async ({ responseMessage }) => {
        if (responseMessage.parts.length === 0) return;

        // A failed store errors the stream; log it, because no onError sees a flush failure.
        await appendMessage(ctx, sessionId, {
          id: responseMessage.id,
          role: "assistant",
          parts: responseMessage.parts,
        }).catch((cause: unknown) => {
          hooks.logError(cause);

          throw cause;
        });
      },
      onError: (error) => streamErrorText(error, hooks.logError),
    }),
  });
}
