import { type ChatTransport, DefaultChatTransport } from "ai";
import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";
import {
  type AgentPageContext,
  agentPageContextSchema,
} from "../../services/agent/page-context.ts";

/**
 * The browser side of the agent route's body, `{ sessionId, message, modelId?, context? }` (Task
 * 5's `chatRequestSchema`). The AI SDK's default body carries the whole history under its own
 * shape; the route reads one message, so this transport sends the last one, the picked model and
 * the page context only. The message keeps the client-made id, which the route accepts.
 */

/** The agent route the app mounts. */
export const AGENT_ROUTE = "/api/agent";

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

/** A new chat's surface binding: the surface and the record of the page it opened on (P11-26). */
export type SurfaceBinding = { readonly id: string; readonly recordId: string };

/** The body the route reads. */
type AgentRouteBody = {
  sessionId: string;
  message: AgentMessage | undefined;
  modelId?: string;
  context?: AgentPageContext;
  surface?: SurfaceBinding;
};

/**
 * The route's transport: one message to one session. A refusal before the stream starts becomes
 * the person-facing message the chat shows, not the route's JSON body. `context` is read when a
 * message goes, so the page the person is on goes with it (AG9, I20).
 */
export function agentTransport(
  api: string,
  options?: {
    readonly context?: () => AgentPageContext | undefined;
    /** Read when a message goes; the route binds only a new chat to it. */
    readonly surface?: () => SurfaceBinding | undefined;
  }
): ChatTransport<AgentMessage> {
  return new DefaultChatTransport<AgentMessage>({
    api,
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);

      if (response.ok) return response;

      throw await refusalFromResponse(response);
    },
    prepareSendMessagesRequest: ({ id, messages, body }) => {
      const picked = sendBody.safeParse(body);

      const sent: AgentRouteBody = { sessionId: id, message: messages.at(-1) };

      if (picked.success && picked.data.modelId !== undefined) {
        sent.modelId = picked.data.modelId;
      }

      const context = agentPageContextSchema.safeParse(options?.context?.());

      // No `context` key without a context, so every recorded Ask request stays the same. A page
      // state the route would refuse is left out, so it never blocks the person's message.
      if (context.success) sent.context = context.data;

      // No `surface` key off a surface page, so Ask's recorded requests stay the same.
      const surface = options?.surface?.();

      if (surface !== undefined) sent.surface = surface;

      return { body: sent };
    },
  });
}
