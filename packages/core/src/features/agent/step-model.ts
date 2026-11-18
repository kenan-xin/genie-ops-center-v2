import { z } from "zod";

import type { StepWords } from "../../../contracts/index.ts";
import { OFFER_CHOICES } from "../../services/agent/choices.ts";
import { FILE_FORMATS } from "../../services/agent/file-kinds.ts";
import type {
  AgentFileState,
  AgentMessage,
  ChatLabels,
} from "../../services/agent/index.ts";
import { toolNameOf } from "../../services/agent/tool-parts.ts";

/**
 * An answer's tool calls as the step timeline shows them (czjw.81, AG16): reads of one dataset in
 * one row at the latest read, a call that was refused and then fixed in one row, and a failure only
 * when the last row was refused and the answer ended. Words, never a tool's name (6.3).
 */

export type MessagePart = AgentMessage["parts"][number];

/** Where a build of several items is: the item that runs or is due, of the planned count. */
export type StepProgress = { readonly n: number; readonly m: number };

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
  /** Set only on a live row of a build, for its bar. */
  readonly progress: StepProgress | undefined;
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

const fileInput = z.object({ format: z.enum(FILE_FORMATS) });

// A partial input, or `n` past `m`, carries no progress (czjw.181).
const progressInput = z.object({
  progress: z
    .object({ n: z.int().min(1), m: z.int().min(1) })
    .refine(({ n, m }) => n <= m),
});

const FILE_NOUNS = {
  csv: "a CSV file",
  xlsx: "an Excel file",
  md: "a Markdown file",
  pdf: "a PDF file",
} as const;

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
export { toolNameOf };

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

function fileWords(part: MessagePart): StepWords {
  const format =
    "input" in part ? fileInput.safeParse(part.input).data?.format : undefined;

  const noun = format === undefined ? "a file" : FILE_NOUNS[format];

  return {
    active: `Making ${noun}`,
    done: `Made ${noun}`,
    failed: `Could not make ${noun}`,
  };
}

function stateOf(part: MessagePart): "active" | "done" | "failed" {
  if (!("state" in part)) return "active";

  if (part.state === "output-available") return "done";

  return part.state === "output-error" ? "failed" : "active";
}

/** A `make-file` call follows its job: done only when the file is ready (R-44a). */
function fileStateOf(
  part: MessagePart,
  files: Readonly<Record<string, AgentFileState>>
): "active" | "done" | "failed" {
  const state = stateOf(part);

  if (state !== "done" || !("toolCallId" in part)) return state;

  const job = files[part.toolCallId];

  if (job === "ready") return "done";

  return job === "failed" ? "failed" : "active";
}

function wordsFor(
  name: string,
  part: MessagePart,
  labels: ChatLabels
): StepWords {
  if (name === "make-artifact") return artifactWords(artifactKindOf(part));

  if (name === "make-file") return fileWords(part);

  return CORE_WORDS.get(name) ?? labels.steps[name] ?? UNKNOWN_WORDS;
}

/** The progress of a call to a tool whose words have `progress`, else undefined. */
function progressOf(
  name: string,
  part: MessagePart,
  labels: ChatLabels
): StepProgress | undefined {
  if (labels.steps[name]?.progress === undefined || !("input" in part)) {
    return undefined;
  }

  return progressInput.safeParse(part.input).data?.progress;
}

function problems(n: number): string {
  return `${n} ${n === 1 ? "problem" : "problems"}`;
}

type Draft = {
  key: string;
  name: string;
  dataset: string | undefined;
  state: "active" | "done" | "failed";
  /** The last call was refused (`output-error`); a failed file job is not a refusal. */
  refused: boolean;
  count: number;
  fixes: number;
  last: MessagePart;
  parts: MessagePart[];
  /** A build row's first item; `progress` holds its last item and the planned count. */
  first: number | undefined;
  progress: StepProgress | undefined;
};

function buildWords(draft: Draft, words: StepWords): string | undefined {
  const { progress, first } = draft;

  if (
    words.progress === undefined ||
    progress === undefined ||
    first === undefined ||
    draft.state === "failed"
  ) {
    return undefined;
  }

  const line =
    draft.state === "active"
      ? words.progress.active
      : first === progress.n
        ? words.progress.doneOne
        : words.progress.done;

  const values = { n: progress.n, m: progress.m, first, last: progress.n };

  return line.replace(/\{(n|m|first|last)\}/g, (_, key: keyof typeof values) =>
    String(values[key])
  );
}

function rowOf(draft: Draft, labels: ChatLabels): TimelineRow {
  const lines = wordsFor(draft.name, draft.last, labels);

  const words = buildWords(draft, lines) ?? lines[draft.state];

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
    progress:
      draft.state === "active" && draft.first !== undefined
        ? draft.progress
        : undefined,
  };
}

/** One row's words as plain text, for a strip line and a test. */
export function rowText(row: TimelineRow): string {
  return `${row.words}${row.object === undefined ? "" : ` ${row.object}`}${row.fix}`;
}

/**
 * `answering`: the answer's text started, so no live row shows (czjw.181). `thinking` is true while
 * the run streams, the answer has not started and no row runs: a Thinking row is the live last row.
 */
export function stepTimeline(
  parts: readonly MessagePart[],
  labels: ChatLabels,
  streaming: boolean,
  files: Readonly<Record<string, AgentFileState>> = {},
  answering = false
): Timeline {
  const drafts: Draft[] = [];

  for (const part of parts) {
    const name = toolNameOf(part);

    // An offer of choices shows as buttons under the answer, not as a step (R-46).
    if (name === null || name === OFFER_CHOICES) continue;

    const state =
      name === "make-file" ? fileStateOf(part, files) : stateOf(part);

    const refused = stateOf(part) === "failed";

    const dataset = name === "query-dataset" ? datasetOf(part) : undefined;

    const progress = progressOf(name, part, labels);

    const open = drafts.at(-1);

    // A call whose input still streams joins an unfinished build as its next item (P15-40).
    if (
      open !== undefined &&
      open.name === name &&
      open.state === "done" &&
      open.progress !== undefined &&
      open.progress.n < open.progress.m &&
      progress === undefined &&
      "state" in part &&
      part.state === "input-streaming"
    ) {
      open.progress = { n: open.progress.n + 1, m: open.progress.m };
      open.state = "active";
      open.last = part;
      open.parts.push(part);
      continue;
    }

    // A call with progress joins the build row before it, and keeps the row's first item.
    if (
      open !== undefined &&
      open.name === name &&
      progress !== undefined &&
      open.progress !== undefined
    ) {
      // A refused call and its fix still count as one fix (czjw.79).
      if (open.refused) open.fixes += 1;

      open.progress = progress;
      open.state = state;
      open.refused = refused;
      open.last = part;
      open.parts.push(part);
      continue;
    }

    // A call after a refused call of the same tool is its fix: one row (czjw.79).
    if (open !== undefined && open.name === name && open.refused) {
      open.fixes += 1;
      open.state = state;
      open.refused = refused;
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

    // The joined row moves to the end, so the running read is the last row (czjw.181).
    if (read !== undefined) {
      read.count += 1;
      read.parts.push(part);

      if (state === "active") read.state = "active";

      drafts.splice(drafts.indexOf(read), 1);
      drafts.push(read);
      continue;
    }

    drafts.push({
      key: "toolCallId" in part ? part.toolCallId : String(drafts.length),
      name,
      dataset,
      state,
      refused,
      count: 1,
      fixes: 0,
      last: part,
      parts: [part],
      first: progress?.n,
      progress,
    });
  }

  const end = drafts.at(-1);

  // Between two calls of a build, its row stays live with the next item, so no Thinking flickers.
  if (
    streaming &&
    !answering &&
    end?.state === "done" &&
    end.progress !== undefined &&
    end.progress.n < end.progress.m
  ) {
    end.state = "active";
    end.progress = { n: end.progress.n + 1, m: end.progress.m };
  }

  const rows = drafts.map((draft) => rowOf(draft, labels));

  const last = rows.at(-1);

  // Only a refused last call fails the answer; a file job that failed says so on its own row.
  const lastRefused = drafts.at(-1)?.refused === true;

  return {
    rows,
    thinking:
      streaming && !answering && !rows.some((row) => row.state === "active"),
    failed: !streaming && lastRefused && last !== undefined ? last : null,
  };
}

/**
 * The rows the working list shows: every running row, and the last finished ones up to
 * `SHOWN_BEFORE_ACTIVE`, in their order. `hidden` counts the finished rows folded away.
 */
export function shownRows(rows: readonly TimelineRow[], expanded: boolean) {
  const finished = rows.filter((row) => row.state !== "active");

  const hidden =
    expanded || finished.length <= SHOWN_BEFORE_ACTIVE
      ? 0
      : finished.length - SHOWN_BEFORE_ACTIVE;

  const folded = new Set(finished.slice(0, hidden));

  return { shown: rows.filter((row) => !folded.has(row)), hidden };
}

/** The elapsed time of a live row, from 0 s: "0s", "24s". */
export function elapsedLabel(ms: number): string {
  return `${Math.floor(ms / 1000)}s`;
}

/** From 20 s a step is slow, and the timeline says the person can stop. */
export function isSlow(ms: number): boolean {
  return ms >= 20_000;
}

const unit = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** A finished answer's time in words: "1 second", "38 seconds", "2 minutes 5 seconds". */
export function durationLabel(ms: number): string {
  // A fast answer still reads "1 second", never "0 seconds".
  const seconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes === 0) return unit(seconds, "second");

  return rest === 0
    ? unit(minutes, "minute")
    : `${unit(minutes, "minute")} ${unit(rest, "second")}`;
}
