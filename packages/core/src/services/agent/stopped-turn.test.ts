import { describe, expect, it } from "vitest";

import { keptOnStop, STOPPED_PART } from "./stopped-turn.ts";
import type { AgentMessage } from "./store.ts";

type Part = AgentMessage["parts"][number];

type CallState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

const text = (value: string): Part => ({ type: "text", text: value });

function call(tool: string, toolCallId: string, state: CallState): Part {
  if (state === "output-available") {
    return { type: `tool-${tool}`, toolCallId, state, input: {}, output: {} };
  }

  if (state === "output-error") {
    return {
      type: `tool-${tool}`,
      toolCallId,
      state,
      input: {},
      errorText: "Refused.",
    };
  }

  return { type: `tool-${tool}`, toolCallId, state, input: {} };
}

const chart = (toolCallId: string, state: CallState) =>
  call("make-artifact", toolCallId, state);

const read = (toolCallId: string, state: CallState) =>
  call("query-dataset", toolCallId, state);

const card = (toolCallId: string): Part => ({
  type: "data-artifact",
  id: toolCallId,
  data: { artifactId: `artifact-${toolCallId}`, version: 1 },
});

const version = (toolCallId: string) => ({ toolCallId, version: 1 });

describe("keptOnStop", () => {
  it("keeps a finished artifact, and drops the card and version of a call that had not returned", () => {
    const { parts, versions } = keptOnStop(
      [
        text("Here is"),
        chart("call-a", "output-available"),
        card("call-a"),
        chart("call-b", "input-available"),
        card("call-b"),
      ],
      [version("call-a"), version("call-b")]
    );

    expect(parts).toEqual([
      text("Here is"),
      chart("call-a", "output-available"),
      card("call-a"),
      STOPPED_PART,
    ]);
    expect(versions.map(({ toolCallId }) => toolCallId)).toEqual(["call-a"]);
  });

  it("keeps finished and refused steps, and drops a running step", () => {
    const { parts } = keptOnStop(
      [
        read("call-1", "output-available"),
        read("call-2", "output-error"),
        read("call-3", "input-streaming"),
      ],
      []
    );

    expect(
      parts.map((part) => ("toolCallId" in part ? part.toolCallId : part.type))
    ).toEqual(["call-1", "call-2", "data-stopped"]);
  });
});
