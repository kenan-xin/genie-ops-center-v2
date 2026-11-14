import { describe, expect, it } from "vitest";

import { continueMessage } from "./continue.ts";
import { priorToolCalls, repeatedCallGuard } from "./loop-guard.ts";
import type { AgentMessage } from "./store.ts";

const STEP = "placeholder-surface-step";

type Input = Readonly<Record<string, string | number | number[]>>;

type Call = { readonly toolName: string; readonly input: Input };

/** Runs the guard after each step as the SDK does, and answers whether it stopped and on what. */
function guarded(prior: readonly AgentMessage[], calls: readonly Call[]) {
  const guard = repeatedCallGuard(priorToolCalls(prior));
  const steps: { toolCalls: Call[] }[] = [];
  let stopped = false;

  for (const call of calls) {
    steps.push({ toolCalls: [call] });
    // SAFETY: the SDK passes full step results; the guard reads only their tool calls.
    stopped = guard.stopWhen({ steps } as never) === true;

    if (stopped) break;
  }

  return { stopped, steps: steps.length, repeated: guard.repeated() };
}

function step(input: Input): Call {
  return { toolName: STEP, input };
}

function person(text: string): AgentMessage {
  return { id: text, role: "user", parts: [{ type: "text", text }] };
}

function answered(...inputs: Input[]): AgentMessage {
  // SAFETY: a stored tool part of the surface tool, as the store keeps it.
  return {
    id: `answer-${JSON.stringify(inputs)}`,
    role: "assistant",
    parts: inputs.map((input, index) => ({
      type: `tool-${STEP}`,
      toolCallId: `call-${index}`,
      state: "output-available",
      input,
      output: { noted: true },
    })),
  } as AgentMessage;
}

const A = { step: "Step 1" };

const B = { step: "Step 2" };

describe("the loop guard of a background run", () => {
  it("stops at the third identical call in a row", () => {
    expect(guarded([], [step(A), step(A), step(A), step(A)])).toEqual({
      stopped: true,
      steps: 3,
      repeated: { toolName: STEP, input: '{"step":"Step 1"}' },
    });
  });

  it("does not stop when another call breaks the row", () => {
    expect(
      guarded([], [step(A), step(A), step(B), step(A), step(A)]).stopped
    ).toBe(false);
  });

  it("does not stop on the same tool with another input", () => {
    expect(guarded([], [step(A), step(B), step({ step: "3" })]).stopped).toBe(
      false
    );
  });

  it("counts the previous turn's calls, through a continue message, whatever their key order", () => {
    const prior = [
      person("Build it."),
      answered({ a: 1, b: [2] }),
      { id: "c", ...continueMessage() },
      answered({ a: 1, b: [2] }),
    ];

    expect(guarded(prior, [step({ b: [2], a: 1 })])).toMatchObject({
      stopped: true,
      steps: 1,
    });
  });

  it("never ends a step without tool calls, also after 3 identical calls", () => {
    const guard = repeatedCallGuard(priorToolCalls([answered(A, A, A)]));

    // SAFETY: the SDK passes full step results; the guard reads only their tool calls.
    const steps = [{ toolCalls: [] }] as never;

    expect({
      stopped: guard.stopWhen({ steps }),
      repeated: guard.repeated(),
    }).toEqual({ stopped: false, repeated: undefined });
  });

  it("sorts keys by code unit, so keys a locale compares as equal still match in any order", () => {
    expect(
      guarded(
        [],
        [
          // A locale compares a zero-width space as nothing, so these two keys tie.
          step({ "ab": 1, "a​b": 2 }),
          step({ "a​b": 2, "ab": 1 }),
          step({ "ab": 1, "a​b": 2 }),
        ]
      ).stopped
    ).toBe(true);
  });

  it("does not count calls before the person's last message", () => {
    const prior = [person("Build it."), answered(A, A), person("Try again.")];

    expect(guarded(prior, [step(A), step(A)]).stopped).toBe(false);
  });
});
