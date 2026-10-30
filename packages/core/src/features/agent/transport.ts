import { type ChatTransport, DefaultChatTransport } from "ai";
import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";

/**
 * The browser side of the agent route's body, `{ sessionId, message, modelId? }` (Task 5's
 * `chatRequestSchema`). The AI SDK's default body carries the whole history under its own shape;
 * the route reads one message, so this transport sends the last one and the picked model only.
 * The message keeps the client-made id, which the route accepts.
 */

/** A refusal the route answered before the stream started, as a person reads it. */
export class AgentRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRefusal";
    this.code = code;
  }
}

/** Codes whose only recovery is a chat with a model the administrator allows now (Review Focus 4). */
const NEW_CHAT_CODES = new Set(["model-not-allowed", "not-found"]);

export type ChatRefusal = {
  readonly message: string;
  readonly requiresNewChat: boolean;
};

const UNANSWERED = "The answer could not be completed. Try again.";

/**
 * The refusal a person sees, or null while the chat has no error. An error the route did not
 * write carries no message a person can use, so it gets the fixed sentence (R-46).
 */
export function refusalOf(error: Error | undefined): ChatRefusal | null {
  if (error === undefined) return null;

  if (!(error instanceof AgentRefusal)) {
    return { message: UNANSWERED, requiresNewChat: false };
  }

  return {
    message: error.message,
    requiresNewChat: NEW_CHAT_CODES.has(error.code),
  };
}

const refusalBody = z.object({ code: z.string(), message: z.string() });

/** The route's `{ code, message, requestId }` body as the refusal the chat shows. */
export async function refusalFromResponse(
  response: Response
): Promise<AgentRefusal> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = refusalBody.safeParse(body);

  return parsed.success
    ? new AgentRefusal(parsed.data.code, parsed.data.message)
    : new AgentRefusal("internal-error", UNANSWERED);
}

const sendBody = z.object({ modelId: z.string().optional() });

/**
 * The route's transport: one message to one session. A refusal before the stream starts becomes
 * the person-facing message the chat shows, not the route's JSON body.
 */
export function agentTransport(api: string): ChatTransport<AgentMessage> {
  return new DefaultChatTransport<AgentMessage>({
    api,
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);

      if (response.ok) return response;

      throw await refusalFromResponse(response);
    },
    prepareSendMessagesRequest: ({ id, messages, body }) => {
      const picked = sendBody.safeParse(body);

      const base = { sessionId: id, message: messages.at(-1) };

      return {
        body:
          picked.success && picked.data.modelId !== undefined
            ? { ...base, modelId: picked.data.modelId }
            : base,
      };
    },
  });
}
