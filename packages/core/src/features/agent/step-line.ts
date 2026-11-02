import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";

type MessagePart = AgentMessage["parts"][number];

/** One tool call as a chat shows it: words, the object in bold, never the tool's name (6.3). */
export type StepLine = {
  readonly text: string;
  readonly object?: string;
  readonly refused?: true;
};

/** The tool a part calls, or null for a part that is not a tool call. */
export function toolNameOf(part: MessagePart): string | null {
  if (part.type === "dynamic-tool") return part.toolName;

  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the tool input is untyped UI data; this reads a display label only
function datasetOf(input: unknown): string | undefined {
  // SAFETY: the query-dataset tool's input is `{ dataset: string }`, or undefined while it
  // streams; this reads a label only.
  const dataset = (input as { readonly dataset?: unknown } | undefined)
    ?.dataset;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display label, not a parse
  return typeof dataset === "string" ? dataset : undefined;
}

function lineOf(part: MessagePart, name: string, labels: ChatLabels): StepLine {
  if (name === "list-datasets") return { text: "Looked up the data" };

  if (name === "open-record") return { text: "Opened a record" };

  if (name === "query-dataset") {
    const dataset = "input" in part ? datasetOf(part.input) : undefined;

    return dataset === undefined
      ? { text: "Read the data" }
      : { text: "Read", object: labels.datasets[dataset] ?? dataset };
  }

  return { text: labels.steps[name] ?? "Used a tool" };
}

/** The human line of one tool call part; a refused call says so. */
export function stepLine(part: MessagePart, labels: ChatLabels): StepLine {
  const name = toolNameOf(part) ?? "";

  const line = lineOf(part, name, labels);

  return "state" in part && part.state === "output-error"
    ? { ...line, refused: true }
    : line;
}
