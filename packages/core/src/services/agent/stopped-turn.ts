import type { AgentMessage } from "./store.ts";

type Part = AgentMessage["parts"][number];

/**
 * The mark of an answer that Stop or the turn limit ended (P03-1). A data part needs no column,
 * and `convertToModelMessages` leaves it out of the next turn's history.
 */
export const STOPPED_PART = {
  type: "data-stopped",
  data: {},
} as const satisfies Part;

/** Whether Stop or the turn limit ended this answer. */
export function isStopped(message: AgentMessage): boolean {
  return message.parts.some(({ type }) => type === STOPPED_PART.type);
}

/** A step that ran to its end: its result or its refusal came back. */
const FINISHED_STATES: ReadonlySet<string> = new Set([
  "output-available",
  "output-error",
]);

/**
 * What a stopped answer keeps (P03-2): every part that is not a tool call, each tool call that
 * finished, and an artifact card and version only when its `make-artifact` call returned. A call
 * that Stop cut off goes, so no step shows that never ends. The stopped mark comes last, once.
 */
export function keptOnStop<V extends { readonly toolCallId: string }>(
  parts: AgentMessage["parts"],
  versions: readonly V[]
) {
  const returned = new Set(
    parts.flatMap((part) =>
      "toolCallId" in part && part.state === "output-available"
        ? [part.toolCallId]
        : []
    )
  );

  const kept = parts.filter((part) => {
    if ("toolCallId" in part) return FINISHED_STATES.has(part.state);

    if (part.type === "data-artifact") return returned.has(part.id ?? "");

    return part.type !== STOPPED_PART.type;
  });

  return {
    parts: [...kept, STOPPED_PART],
    versions: versions.filter(({ toolCallId }) => returned.has(toolCallId)),
  };
}
