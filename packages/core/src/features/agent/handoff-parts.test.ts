import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../services/agent/index.ts";
import { latestHandoff, startedHandoff } from "./handoff-parts.ts";

const CARD = {
  sessionId: "7d1f5c62-5a0e-4b8e-9d0c-4f8f0f6d2a11",
  title: "October placeholder review",
  agentName: "Placeholder agent",
  address: "/placeholder/r1",
};

function answer(state: "output-available" | "output-error"): AgentMessage {
  const call =
    state === "output-available"
      ? {
          type: "tool-hand-over" as const,
          toolCallId: "call_1",
          state,
          input: {},
          output: { handedTo: CARD.agentName, title: CARD.title },
        }
      : {
          type: "tool-hand-over" as const,
          toolCallId: "call_1",
          state,
          input: {},
          errorText: "Work is still building.",
        };

  return {
    id: `answer-${state}`,
    role: "assistant",
    parts: [call, { type: "data-handoff", id: "call_1", data: CARD }],
  };
}

const plain: AgentMessage = {
  id: "plain",
  role: "assistant",
  parts: [{ type: "text", text: "Here are the records." }],
};

describe("startedHandoff", () => {
  it("answers the card only when its hand-over call returned", () => {
    expect({
      started: startedHandoff(answer("output-available")),
      busy: startedHandoff(answer("output-error")),
      none: startedHandoff(plain),
    }).toEqual({ started: CARD, busy: undefined, none: undefined });
  });
});

describe("latestHandoff", () => {
  it("answers the last card of the chat, started or not", () => {
    const later = { ...CARD, title: "Later review" };

    const busy = answer("output-error");

    expect(
      latestHandoff([
        answer("output-available"),
        {
          ...busy,
          parts: [
            busy.parts[0]!,
            { type: "data-handoff", id: "call_1", data: later },
          ],
        },
        plain,
      ])
    ).toEqual(later);
    expect(latestHandoff([plain])).toBeUndefined();
  });
});
