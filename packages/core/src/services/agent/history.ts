import type { AgentMessage } from "./store.ts";

/**
 * The most stored messages one model call gets (`czjw.30`). The bead's trigger was a session past
 * 40 messages: a longer history grows each turn's prompt, cost and time toward the context window.
 */
export const HISTORY_MESSAGES = 40;

/**
 * The fallback window when a summary call fails (`compaction.ts`, LC6), and the message trigger of
 * compaction. The session history a model call gets: all of it up to the limit, else the last messages from a
 * user message on, so the window never opens on an answer without its question. A stored answer
 * keeps its tool calls and their results in the same message, so a kept answer keeps the data it
 * was built on. An answer's charts run their own queries when drawn, so a later turn needs no
 * dropped tool result.
 */
export function trimHistory(
  history: readonly AgentMessage[]
): readonly AgentMessage[] {
  if (history.length <= HISTORY_MESSAGES) return history;

  const window = history.slice(-HISTORY_MESSAGES);
  const start = window.findIndex((message) => message.role === "user");

  return start <= 0 ? window : window.slice(start);
}
