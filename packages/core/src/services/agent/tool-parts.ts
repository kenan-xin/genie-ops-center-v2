import type { AgentMessage } from "./store.ts";

/** The tool a message part calls, or null for a part that calls none. */
export function toolNameOf(part: AgentMessage["parts"][number]): string | null {
  if (part.type === "dynamic-tool") return part.toolName;

  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}
