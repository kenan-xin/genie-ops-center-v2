import { describe, expect, it } from "vitest";

import {
  CONTINUE_TEXT,
  continueMessage,
  isContinueMessage,
  runTurnOutcome,
} from "./continue.ts";

describe("the continue message of a run's next turn", () => {
  it("is told apart by its data part, not by its text", () => {
    const person = {
      id: "m1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: CONTINUE_TEXT }],
    };

    expect({
      continued: isContinueMessage({ id: "m2", ...continueMessage() }),
      person: isContinueMessage(person),
    }).toEqual({ continued: true, person: false });
  });
});

describe("what a run does after a turn", () => {
  const quiet = {
    deadlinePassed: false,
    stopAsked: false,
    turnLimitPassed: false,
    failed: false,
  };

  it.each([
    [
      "a turn the deadline cut",
      { end: "cut", deadlinePassed: true },
      "time-limit",
    ],
    [
      "a turn the turn limit cut",
      { end: "cut", turnLimitPassed: true },
      "continue",
    ],
    // A late timer: the turn finished on its own before the deadline or limit fired.
    [
      "an answer finished as the deadline passed",
      { end: "answered", deadlinePassed: true },
      "done",
    ],
    [
      "an answer finished as the turn limit passed",
      { end: "answered", turnLimitPassed: true },
      "done",
    ],
    [
      "a capped turn as the deadline passed",
      { end: "step-limit", deadlinePassed: true },
      "continue",
    ],
    [
      "a cut turn with Stop and a stream error",
      { end: "cut", stopAsked: true, failed: true },
      "stopped",
    ],
    [
      "a cut turn with a stream error only",
      { end: "cut", failed: true },
      "failed",
    ],
    ["a capped turn", { end: "step-limit" }, "continue"],
    [
      "a capped turn with a stream error",
      { end: "step-limit", failed: true },
      "failed",
    ],
  ] as const)("%s", (_, turn, outcome) => {
    expect(runTurnOutcome({ ...quiet, ...turn })).toBe(outcome);
  });
});
