import {
  getToolName,
  isToolUIPart,
  type StopCondition,
  type ToolSet,
} from "ai";
import { isPlainObject } from "es-toolkit";

import { isContinueMessage } from "./continue.ts";
import { LOOP_REPEATS } from "./limits.ts";
import type { AgentMessage } from "./store.ts";

/** One tool call as the loop guard compares it: the name and the input as stable JSON. */
export type ToolCallKey = { readonly toolName: string; readonly input: string };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a tool call's input, compared as JSON only
function callKey(toolName: string, input: unknown): ToolCallKey {
  return {
    toolName,
    input:
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON value, sorted where it is an object
      JSON.stringify(input, (_key, value: unknown) =>
        isPlainObject(value)
          ? Object.fromEntries(
              // By code unit: a locale compares some distinct keys as equal.
              Object.entries(value).toSorted(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0
              )
            )
          : value
      ) ?? "",
  };
}

/**
 * The run's tool calls in order since the last message the person wrote; a run's continue message
 * does not count as one (R11). A call still streaming its input is no call, as the SDK skips it.
 */
export function priorToolCalls(
  messages: readonly AgentMessage[]
): ToolCallKey[] {
  const person = messages.findLastIndex(
    (message) => message.role === "user" && !isContinueMessage(message)
  );

  return messages
    .slice(person + 1)
    .flatMap(({ parts }) =>
      parts.flatMap((part) =>
        isToolUIPart(part) && part.state !== "input-streaming"
          ? [
              callKey(
                getToolName(part),
                part.state === "output-error"
                  ? (part.input ??
                      ("rawInput" in part ? part.rawInput : undefined))
                  : part.input
              ),
            ]
          : []
      )
    );
}

/**
 * Stops a turn at `LOOP_REPEATS` identical tool calls in a row, counting the run's earlier calls
 * too, after OpenRouter's agent SDK (DEC-57 item 3). `repeated` answers the call it stopped on.
 */
export function repeatedCallGuard(prior: readonly ToolCallKey[]) {
  let repeated: ToolCallKey | undefined;

  const stopWhen: StopCondition<ToolSet> = ({ steps }) => {
    // A step with no tool calls is an answer, never a loop, whatever came before it.
    if (steps.at(-1)?.toolCalls.length === 0) return false;

    const row = [
      ...prior,
      ...steps.flatMap(({ toolCalls }) =>
        toolCalls.map((call) => callKey(call.toolName, call.input))
      ),
    ].slice(-LOOP_REPEATS);

    const [first] = row;

    if (
      first !== undefined &&
      row.length === LOOP_REPEATS &&
      row.every(
        ({ toolName, input }) =>
          toolName === first.toolName && input === first.input
      )
    ) {
      repeated = first;
    }

    return repeated !== undefined;
  };

  return { stopWhen, repeated: (): ToolCallKey | undefined => repeated };
}

/** The answer of a run that the loop guard ended (DEC-57 item 3, R8). */
export function loopText(toolName: string): string {
  return `This run stopped because Ask called ${toolName} ${LOOP_REPEATS} times in a row with the same input. The work it finished is saved.`;
}
