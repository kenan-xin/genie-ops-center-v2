import type { TurnEnd } from "./chat.ts";
import type { AgentMessage } from "./store.ts";

/**
 * A background run is a chain of bounded turns (DEC-57): a turn that still has work queues the next
 * turn with this message. Its data part marks it, so the chat hides it and a person's message with
 * the same words still shows; `convertToModelMessages` leaves the data part out, so only the text
 * reaches the model (R10).
 */
export const CONTINUE_PART = "data-continue";

export const CONTINUE_TEXT = "Continue the task from where you stopped.";

/** The answer of a run that the time box ended (DEC-57 item 7, R8). */
export const TIME_LIMIT_TEXT =
  "This run reached its time limit and stopped. The work it finished is saved.";

export function continueMessage() {
  return {
    role: "user" as const,
    parts: [
      { type: CONTINUE_PART, data: {} },
      { type: "text", text: CONTINUE_TEXT },
    ] satisfies AgentMessage["parts"],
  };
}

export function isContinueMessage(message: AgentMessage): boolean {
  return message.parts.some(({ type }) => type === CONTINUE_PART);
}

/**
 * What a run does after a turn's stream ended. The deadline and the turn limit count only when
 * they cut the turn: a turn that finished on its own just before either fired is not cut. Stop
 * comes before a stream error, because an abort can also report one (R8, R9).
 */
export function runTurnOutcome(turn: {
  readonly end: TurnEnd | undefined;
  readonly deadlinePassed: boolean;
  readonly stopAsked: boolean;
  readonly turnLimitPassed: boolean;
  readonly failed: boolean;
}): "time-limit" | "stopped" | "continue" | "failed" | "done" {
  const cut = turn.end === "cut";

  if (cut && turn.deadlinePassed) return "time-limit";

  if (turn.stopAsked) return "stopped";

  if (cut && turn.turnLimitPassed) return "continue";

  if (turn.failed) return "failed";

  return turn.end === "step-limit" ? "continue" : "done";
}
