import { z } from "zod";

import type { HandoffCardData } from "../../services/agent/hand-over.ts";
import type { AgentMessage } from "../../services/agent/index.ts";

/** The card part's data as the stored answer holds it, checked where the chat reads it. */
const cardSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  agentName: z.string(),
  address: z.string(),
});

type Card = { readonly callId: string; readonly data: HandoffCardData };

/** The handoff card parts of one answer, in order. */
export function handoffCardsOf(message: AgentMessage): readonly Card[] {
  return message.parts.flatMap((part) => {
    if (part.type !== "data-handoff" || !("data" in part)) return [];

    const parsed = cardSchema.safeParse(part.data);

    return parsed.success ? [{ callId: part.id ?? "", data: parsed.data }] : [];
  });
}

/**
 * The card of an answer whose `hand-over` call returned, so the page opens only for a new handoff.
 * Undefined when the call failed, as a second handoff while one builds does, or there is no card.
 */
export function startedHandoff(
  message: AgentMessage
): HandoffCardData | undefined {
  return handoffCardsOf(message).find(({ callId }) =>
    message.parts.some(
      (part) =>
        part.type === "tool-hand-over" &&
        "toolCallId" in part &&
        part.toolCallId === callId &&
        part.state === "output-available"
    )
  )?.data;
}

/** The last card part of the chat, started or not, for the header chip. */
export function latestHandoff(
  messages: readonly AgentMessage[]
): HandoffCardData | undefined {
  return messages.flatMap(handoffCardsOf).at(-1)?.data;
}
