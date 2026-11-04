import { z } from "zod";

import type { StepWords } from "../../../contracts/index.ts";
import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";

/**
 * An answer's tool calls as the step timeline shows them (czjw.81, AG16): reads of one dataset in
 * one row at the first read, a call that was refused and then fixed in one row, and a failure only
 * when the last row was refused and the answer ended. Words, never a tool's name (6.3).
 */

export type MessagePart = AgentMessage["parts"][number];

export type TimelineRow = {
  /** The first toolCallId of the row. */
  readonly key: string;
  readonly state: "active" | "done" | "failed";
  /** The verb phrase, for example "Made a chart" or "Read". */
  readonly words: string;
  /** The bold dataset title after the words. */
  readonly object: string | undefined;
  /** ", fixed 1 problem" or ", fixing 2 problems" after the object; "" with no fix. */
  readonly fix: string;
  /** Reads of one dataset; 1 otherwise. */
  readonly count: number;
  /** Refused calls folded into the row before its last call. */
  readonly fixes: number;
  readonly parts: readonly MessagePart[];
};

export type Timeline = {
  readonly rows: readonly TimelineRow[];
  readonly thinking: boolean;
  readonly failed: TimelineRow | null;
};

/** While the agent works, at most this many finished rows show above the active one. */
export const SHOWN_BEFORE_ACTIVE = 2;

const CORE_WORDS = new Map<string, StepWords>([
  [
    "list-datasets",
    {
      active: "Looking up the data",
      done: "Looked up the data",
      failed: "Could not look up the data",
    },
  ],
  [
    "query-dataset",
    { active: "Reading", done: "Read", failed: "Could not read" },
  ],
  [
    "open-record",
    {
      active: "Opening a record",
      done: "Opened a record",
      failed: "Could not open a record",
    },
  ],
]);

// The two input fields the words read; anything else in a tool input is ignored.
const readInput = z.object({ dataset: z.string() });

const artifactInput = z.object({ config: z.object({ type: z.string() }) });

const UNKNOWN_WORDS: StepWords = {
  active: "Using a tool",
  done: "Used a tool",
  failed: "A tool could not run",
};

function artifactWords(kind: "chart" | "table"): StepWords {
  return {
    active: `Making a ${kind}`,
    done: `Made a ${kind}`,
    failed: `Could not make a ${kind}`,
  };
}

/** The tool a part calls, or null for a part that is not a tool call. */
export function toolNameOf(part: MessagePart): string | null {
  if (part.type === "dynamic-tool") return part.toolName;

  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

/** The dataset a read names, or undefined while its input still streams. */
function datasetOf(part: MessagePart): string | undefined {
  return "input" in part
    ? readInput.safeParse(part.input).data?.dataset
    : undefined;
}

function artifactKindOf(part: MessagePart): "chart" | "table" {
  const type =
    "input" in part
      ? artifactInput.safeParse(part.input).data?.config.type
      : undefined;

  return type === "table" ? "table" : "chart";
}

function stateOf(part: MessagePart): "active" | "done" | "failed" {
  if (!("state" in part)) return "active";

  if (part.state === "output-available") return "done";

  return part.state === "output-error" ? "failed" : "active";
}

function wordsFor(
  name: string,
  part: MessagePart,
  labels: ChatLabels
): StepWords {
  if (name === "make-artifact") return artifactWords(artifactKindOf(part));

  return CORE_WORDS.get(name) ?? labels.steps[name] ?? UNKNOWN_WORDS;
}

function problems(n: number): string {
  return `${n} ${n === 1 ? "problem" : "problems"}`;
}

type Draft = {
  key: string;
  name: string;
  dataset: string | undefined;
  state: "active" | "done" | "failed";
  count: number;
  fixes: number;
  last: MessagePart;
  parts: MessagePart[];
};

function rowOf(draft: Draft, labels: ChatLabels): TimelineRow {
  const words = wordsFor(draft.name, draft.last, labels)[draft.state];

  const object =
    draft.dataset === undefined
      ? undefined
      : (labels.datasets[draft.dataset] ?? draft.dataset);

  let fix = "";

  if (draft.fixes > 0 && draft.state === "active") {
    fix = `, fixing ${problems(draft.fixes)}`;
  } else if (draft.fixes > 0 && draft.state === "done") {
    fix = `, fixed ${problems(draft.fixes)}`;
  }

  return {
    key: draft.key,
    state: draft.state,
    // A read whose input still streams names no dataset yet.
    words:
      draft.name === "query-dataset" && object === undefined
        ? `${words} the data`
        : words,
    object,
    fix,
    count: draft.count,
    fixes: draft.fixes,
    parts: draft.parts,
  };
}

/** One row's words as plain text, for a strip line and a test. */
export function rowText(row: TimelineRow): string {
  return `${row.words}${row.object === undefined ? "" : ` ${row.object}`}${row.fix}`;
}

export function stepTimeline(
  parts: readonly MessagePart[],
  labels: ChatLabels,
  streaming: boolean
): Timeline {
  const drafts: Draft[] = [];

  for (const part of parts) {
    const name = toolNameOf(part);

    if (name === null) continue;

    const state = stateOf(part);

    const dataset = name === "query-dataset" ? datasetOf(part) : undefined;

    const open = drafts.at(-1);

    // A call after a refused call of the same tool is its fix: one row (czjw.79).
    if (open !== undefined && open.name === name && open.state === "failed") {
      open.fixes += 1;
      open.state = state;
      open.last = part;
      open.dataset = dataset ?? open.dataset;
      open.parts.push(part);
      continue;
    }

    const read =
      dataset !== undefined && state !== "failed"
        ? drafts.find(
            (draft) =>
              draft.name === name &&
              draft.dataset === dataset &&
              draft.state !== "failed"
          )
        : undefined;

    if (read !== undefined) {
      read.count += 1;
      read.parts.push(part);

      if (state === "active") read.state = "active";

      continue;
    }

    drafts.push({
      key: "toolCallId" in part ? part.toolCallId : String(drafts.length),
      name,
      dataset,
      state,
      count: 1,
      fixes: 0,
      last: part,
      parts: [part],
    });
  }

  const rows = drafts.map((draft) => rowOf(draft, labels));

  const last = rows.at(-1);

  const answered = parts.some(
    (part) => part.type === "text" && part.text.trim() !== ""
  );

  return {
    rows,
    thinking: streaming && rows.length === 0 && !answered,
    failed: !streaming && last?.state === "failed" ? last : null,
  };
}

/** The elapsed time of the active step, shown from 3 s: "24s". */
export function elapsedLabel(ms: number): string | null {
  return ms < 3000 ? null : `${Math.floor(ms / 1000)}s`;
}

/** From 20 s a step is slow, and the timeline says the person can stop. */
export function isSlow(ms: number): boolean {
  return ms >= 20_000;
}

/** A finished answer's time: "38s", or "2m 5s" from a minute. */
export function durationLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);

  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
