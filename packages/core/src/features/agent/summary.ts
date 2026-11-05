import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";

/** Where the summary of a long chat starts: after this message (S7-34, LC7). */
export type SummaryBoundary = {
  readonly messageId: string;
  readonly summary: string;
};

const storedSummary = z.object({ summary: z.string() });

/** The transient part a turn that summarized streams first. */
export const liveSummarySchema = z.object({
  throughMessageId: z.string(),
  summary: z.string(),
});

export type LiveSummary = z.infer<typeof liveSummarySchema>;

/** The summary a stored message carries in its metadata: only the last summarized one has it. */
export function summaryOf(message: AgentMessage): string | undefined {
  return storedSummary.safeParse(message.metadata).data?.summary;
}

/** The latest summary: this turn's when its message is shown, else the last stored one. */
export function summaryBoundary(
  messages: readonly AgentMessage[],
  live: LiveSummary | null
): SummaryBoundary | null {
  if (
    live !== null &&
    messages.some(({ id }) => id === live.throughMessageId)
  ) {
    return { messageId: live.throughMessageId, summary: live.summary };
  }

  for (const message of messages.toReversed()) {
    const summary = summaryOf(message);

    if (summary !== undefined) return { messageId: message.id, summary };
  }

  return null;
}
