import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../services/agent/index.ts";
import { choicesOf } from "./choice-parts.ts";

const OFFER = {
  question: "Add the chart to the dashboard, or just show it here?",
  choices: ["Add", "Just show it here"],
};

type Part = AgentMessage["parts"][number];

function answer(part: Part): AgentMessage {
  return { id: "answer", role: "assistant", parts: [part] };
}

describe("choicesOf", () => {
  it("gives the choices of an answered offer, and nothing for a refused, streaming or malformed one", () => {
    expect({
      answered: choicesOf(
        answer({
          type: "tool-offer-choices",
          toolCallId: "call_1",
          state: "output-available",
          input: OFFER,
          output: { shown: true },
        })
      ),
      refused: choicesOf(
        answer({
          type: "tool-offer-choices",
          toolCallId: "call_1",
          state: "output-error",
          input: OFFER,
          errorText: "Give each choice once.",
        })
      ),
      streaming: choicesOf(
        answer({
          type: "tool-offer-choices",
          toolCallId: "call_1",
          state: "input-streaming",
          input: OFFER,
        })
      ),
      malformed: choicesOf(
        answer({
          type: "tool-offer-choices",
          toolCallId: "call_1",
          state: "output-available",
          input: { question: OFFER.question, choices: ["Add"] },
          output: { shown: true },
        })
      ),
    }).toEqual({
      answered: OFFER,
      refused: undefined,
      streaming: undefined,
      malformed: undefined,
    });
  });
});
