import type { StepResult, ToolSet } from "ai";
import { expect, it } from "vitest";

import { choicesOffered, OFFER_CHOICES } from "./choices.ts";

const call = { type: "tool-call", toolCallId: "c1", toolName: OFFER_CHOICES };

function step(
  toolCalls: readonly object[],
  toolResults: readonly object[]
): StepResult<ToolSet> {
  // SAFETY: the stop condition reads only `toolCalls` and `toolResults`; `never` stands in for the rest of the step.
  return { toolCalls, toolResults } as never;
}

it("ends the turn after a successful offer, never after a refused one, another tool's result or before any step", async () => {
  const offered = step([call], [{ ...call, type: "tool-result" }]);
  const refused = step([call], []);
  const read = { ...call, toolName: "query-dataset" };
  const other = step([read], [{ ...read, type: "tool-result" }]);

  const answers = await Promise.all(
    [[offered], [offered, refused], [other], []].map((steps) =>
      choicesOffered({ steps })
    )
  );

  expect(answers).toEqual([true, false, false, false]);
});
