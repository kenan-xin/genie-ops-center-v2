import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../services/agent/index.ts";
import { artifactRefsOf } from "./artifact-refs.ts";

const FIRST = "11111111-1111-4111-8111-111111111111";

const SECOND = "22222222-2222-4222-8222-222222222222";

function call(
  id: string,
  type: string,
  title: string
): AgentMessage["parts"][number] {
  return {
    type: "tool-make-artifact",
    toolCallId: id,
    state: "output-available",
    input: { config: { type, title, series: [] } },
    output: { artifact: 1, version: 1, title },
  };
}

describe("artifactRefsOf", () => {
  it("pairs each card part with the call that made it", () => {
    const message: AgentMessage = {
      id: "answer",
      role: "assistant",
      parts: [
        call("call-a", "bar", "Quantity by record"),
        call("call-b", "table", "Records"),
        // In the other order than the calls, so a pairing by position fails.
        {
          type: "data-artifact",
          id: "call-b",
          data: { artifactId: SECOND, version: 2 },
        },
        {
          type: "data-artifact",
          id: "call-a",
          data: { artifactId: FIRST, version: 1 },
        },
        // Stored data that is not a version reference shows no card.
        {
          type: "data-artifact",
          id: "call-a",
          data: { artifactId: "x", version: 0 },
        },
        { type: "text", text: "Here they are." },
      ],
    };

    expect(artifactRefsOf(message)).toEqual([
      {
        artifactId: SECOND,
        version: 2,
        toolCallId: "call-b",
        kind: "table",
        title: "Records",
        config: { type: "table", title: "Records", series: [] },
      },
      {
        artifactId: FIRST,
        version: 1,
        toolCallId: "call-a",
        kind: "chart",
        title: "Quantity by record",
        config: { type: "bar", title: "Quantity by record", series: [] },
      },
    ]);
  });
});
