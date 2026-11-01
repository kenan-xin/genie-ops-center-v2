import { describe, expect, it } from "vitest";

import { HISTORY_MESSAGES, trimHistory } from "./history.ts";
import type { AgentMessage } from "./store.ts";

function user(index: number): AgentMessage {
  return {
    id: `u${index}`,
    role: "user",
    parts: [{ type: "text", text: `Question ${index}` }],
  };
}

/** An answer that queried a dataset: the tool call and its result sit in the same message. */
function answer(index: number): AgentMessage {
  return {
    id: `a${index}`,
    role: "assistant",
    parts: [
      {
        type: "tool-query-dataset",
        toolCallId: `call-${index}`,
        state: "output-available",
        input: { dataset: "orders" },
        output: { rows: [{ total: index }] },
      },
      { type: "text", text: `Answer ${index}` },
    ],
  };
}

/** A session of `turns` questions, each with its answer. */
function session(turns: number): AgentMessage[] {
  return Array.from({ length: turns }, (_, index) => [
    user(index),
    answer(index),
  ]).flat();
}

describe("the history sent to the model", () => {
  it("keeps only the last messages of a long session, from a question, with each kept answer's tool result", () => {
    // The new question is the last message, so the history ends on a user message.
    const history = [...session(30), user(30)];

    const sent = trimHistory(history);

    expect(sent.length).toBeLessThanOrEqual(HISTORY_MESSAGES);
    expect(sent.length).toBeGreaterThan(HISTORY_MESSAGES - 2);
    expect(sent[0]?.role).toBe("user");
    expect(sent.at(-1)).toEqual(user(30));
    expect(sent).toEqual(history.slice(history.length - sent.length));
    expect(sent.at(-2)).toEqual(answer(29));
  });

  it("sends a session at the limit unchanged", () => {
    const history = [...session(HISTORY_MESSAGES / 2 - 1), user(98), user(99)];

    expect(history).toHaveLength(HISTORY_MESSAGES);
    expect(trimHistory(history)).toEqual(history);
  });
});
