"use client";

import { Button, focusRing } from "@genie/ui";
import {
  createParser,
  Renderer,
  type OpenUIError,
  type ParseResult,
} from "@openuidev/react-lang";
import { CopyIcon, DatabaseIcon, InfoIcon, TableIcon } from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import type {
  AgentFile,
  AgentMessage,
  ChatLabels,
} from "../../services/agent/index.ts";
import { isStopped } from "../../services/agent/stopped-turn.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { fmtDate } from "../audit/helpers.ts";
import { ANSWER_LIBRARY } from "./answer-library.tsx";
import {
  type Read,
  readSentence,
  readsOf,
  refusedReads,
  rowsText,
  sourceTitles,
} from "./answer-sources.ts";
import { ArtifactCard, type ArtifactCardAction } from "./artifact-card.tsx";
import { artifactRefsOf } from "./artifact-refs.ts";
import { ChoiceButtons, QuestionPills } from "./chat-parts.tsx";
import { choicesOf } from "./choice-parts.ts";
import { FileCard } from "./file-card.tsx";
import { fileCallsOf } from "./file-refs.ts";
import { HandoffCard } from "./handoff-card.tsx";
import { handoffCardsOf } from "./handoff-parts.ts";
import { StepTimeline } from "./step-timeline.tsx";

/**
 * The one message-part renderer (Spec 7 R-45, DEC-29). A user message is plain text. An assistant
 * message draws its tool calls as the step timeline (czjw.81) above the answer, and each text part
 * through the answer catalog. A part the parser cannot read shows its text as a paragraph; a part
 * that failed shows what it could draw and one repair line.
 */

const NO_LABELS: ChatLabels = { steps: {}, datasets: {}, fields: {} };

const NO_FILES: readonly AgentFile[] = [];

// An OpenUI answer opens with a statement such as `root = Answer(...)`.
const OPENUI_START = /^\s*[A-Za-z_]\w*\s*=/;

/**
 * The text parts that are notes about the model's next step, not its answer (P03-7, `czjw.105`):
 * text that opens with no OpenUI statement, before a tool call or in a stopped answer. A note never
 * reaches the OpenUI parser, so it neither shows nor counts as a stream error.
 */
function stepNotes(message: AgentMessage): ReadonlySet<number> {
  const stopped = isStopped(message);

  return new Set(
    message.parts.flatMap((part, index) =>
      part.type === "text" &&
      !OPENUI_START.test(part.text) &&
      (stopped ||
        message.parts.slice(index + 1).some((later) => "toolCallId" in later))
        ? [index]
        : []
    )
  );
}

type ChartNode = {
  readonly typeName?: string;
  readonly props?: { readonly config?: unknown };
};

/**
 * A Chart whose config the gate's own schema refuses reaches the view with no parser error, so
 * the part notices it from the parsed tree (`catalog.ts`: the Chart takes a raw panel config).
 */
function hasUnreadableChart(result: ParseResult | null | undefined): boolean {
  const children = result?.root?.props["children"];

  if (!Array.isArray(children)) return false;

  return children.some((child) => {
    // SAFETY: a parsed Answer child is an element node with a type name and props.
    const node = child as ChartNode;

    return (
      node.typeName === "Chart" &&
      checkPanelConfig(node.props?.config).config === undefined
    );
  });
}

const answerParser = createParser(ANSWER_LIBRARY.toJSONSchema());

const nextSchema = z.array(z.string());

/**
 * The questions a finished answer's root proposes in `next` (czjw.120 item 8). It parses the whole
 * text, because the renderer's last streaming result can hold half the list.
 */
function nextOf(text: string | undefined): readonly string[] {
  if (text === undefined) return [];

  const next = nextSchema.safeParse(
    answerParser.parse(text).root?.props["next"]
  );

  return next.success ? next.data.slice(0, 3) : [];
}

function AnswerText(props: {
  readonly text: string;
  readonly streaming: boolean;
}) {
  // `undefined` means the parser has not reported yet. `null` is a reported result with no root.
  const [result, setResult] = useState<ParseResult | null | undefined>(
    undefined
  );

  const [errors, setErrors] = useState<readonly OpenUIError[]>([]);

  const drawn = result?.root != null;

  const unreadable =
    !props.streaming && result !== undefined && result?.root == null;

  const repair =
    !props.streaming &&
    drawn &&
    (errors.some((error) => error.severity !== "warning") ||
      hasUnreadableChart(result));

  return (
    // oxlint-disable-next-line shadcn/no-unknown-classes -- Typeset's preset class arrives with typeset.css
    <div className="typeset typeset-chat">
      <Renderer
        response={props.text}
        library={ANSWER_LIBRARY}
        isStreaming={props.streaming}
        onError={setErrors}
        onParseResult={setResult}
      />
      {unreadable ? <p className="whitespace-pre-wrap">{props.text}</p> : null}
      {repair ? (
        <p className="text-muted-foreground text-sm">
          Part of this answer could not be drawn.
        </p>
      ) : null}
    </div>
  );
}

const rowsLinkClass = `inline-flex min-h-11 items-center gap-1.5 rounded-md font-semibold text-primary underline-offset-4 hover:underline lg:min-h-8 dark:text-brand-on-dark ${focusRing}`;

/** "See the 6 rows": the rows view beside the chat in Ask, a link to it in the agent panel. */
function RowsLink(props: {
  readonly read: Read;
  readonly action: ArtifactCardAction;
}): ReactNode {
  const { read, action } = props;

  const label = (
    <>
      <TableIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      See the {rowsText(read.rows.length, read.truncated)}
    </>
  );

  if (action.kind === "link") {
    return (
      <a href={action.rowsHref(read.toolCallId)} className={rowsLinkClass}>
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={rowsLinkClass}
      onClick={() => action.onOpenRows(read)}
    >
      {label}
    </button>
  );
}

/**
 * How an answer counted (czjw.108, method-fold variant A): one plain sentence per read with its
 * key words in bold, then its rows and its date; with two reads, each gets a "Read n" label. A
 * read that matched nothing and a refused read say so.
 */
function MethodPanel(props: {
  readonly id: string;
  readonly reads: readonly Read[];
  readonly refused: readonly string[];
  readonly labels: ChatLabels;
  readonly action: ArtifactCardAction | undefined;
}): ReactNode {
  const { reads, labels } = props;

  return (
    <div
      id={props.id}
      className="mt-1.5 grid gap-3 rounded-lg bg-muted px-3.5 py-3 text-sm text-muted-foreground"
    >
      {reads.map((read, index) => {
        const title = labels.datasets[read.dataset] ?? read.dataset;

        return (
          <div key={read.toolCallId} className="grid gap-1">
            {reads.length > 1 ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <DatabaseIcon
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
                Read {index + 1}: {title}
              </p>
            ) : null}
            <p>
              {readSentence(read, labels).map((part, at) =>
                part.strong ? (
                  <b key={at} className="font-semibold text-foreground">
                    {part.text}
                  </b>
                ) : (
                  part.text
                )
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-3">
              {read.rows.length === 0 ? (
                <span>No rows matched.</span>
              ) : props.action === undefined ? null : (
                <RowsLink read={read} action={props.action} />
              )}
              <span className="text-xs">
                {title} as of {fmtDate(read.asOf, "UTC")}
              </span>
            </div>
          </div>
        );
      })}
      {props.refused.map((title) => (
        <p key={title}>
          {title}: this read was refused, so it counted nothing.
        </p>
      ))}
    </div>
  );
}

/**
 * One row under a finished answer (czjw.120 item 6): the datasets it read by title, the reporting
 * date, "How this was counted" and Copy. The method opens in a quiet panel under the row, so the
 * result reads first.
 */
function AnswerMeta(props: {
  readonly parts: AgentMessage["parts"];
  readonly labels: ChatLabels;
  readonly action: ArtifactCardAction | undefined;
  readonly answer: () => string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const reads = readsOf(props.parts);
  const refused = refusedReads(props.parts, props.labels);
  const sources = sourceTitles(props.parts, props.labels);

  // The latest reporting date of the reads; a calendar day, so it is shown in UTC.
  const asOf = reads
    .map((read) => read.asOf)
    .toSorted()
    .at(-1);

  const counted = reads.length > 0 || refused.length > 0;

  return (
    <div className="grid">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {sources.length === 0 ? null : (
          <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
            {sources.map((title) => (
              <li
                key={title}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-tile px-2.5 font-semibold"
              >
                <DatabaseIcon
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
                <span className="sr-only">Source: </span>
                {title}
              </li>
            ))}
          </ul>
        )}
        {asOf === undefined ? null : <span>as of {fmtDate(asOf, "UTC")}</span>}
        <span className="ms-auto flex items-center gap-1">
          {counted ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => setOpen(!open)}
            >
              <InfoIcon aria-hidden="true" strokeWidth={1.75} />
              How this was counted
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(props.answer()).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <CopyIcon aria-hidden="true" strokeWidth={1.75} />
            {copied ? "Copied" : "Copy"}
          </Button>
        </span>
      </div>
      {open ? (
        <MethodPanel
          id={panelId}
          reads={reads}
          refused={refused}
          labels={props.labels}
          action={props.action}
        />
      ) : null}
    </div>
  );
}

/** The artifacts an answer made, after its prose (R-45a). */
function ArtifactCards(props: {
  readonly message: AgentMessage;
  readonly action: ArtifactCardAction;
  readonly ready: boolean;
}): ReactNode {
  const cards = artifactRefsOf(props.message);

  if (cards.length === 0) return null;

  return (
    <ul aria-label="Artifacts" className="grid gap-2">
      {cards.map((artifact) => (
        <li key={artifact.toolCallId}>
          <ArtifactCard
            artifact={artifact}
            action={props.action}
            ready={props.ready}
          />
        </li>
      ))}
    </ul>
  );
}

/** The handoffs an answer made, after its prose and before its artifacts (S7-41). */
function HandoffCards(props: {
  readonly message: AgentMessage;
  readonly labels: ChatLabels;
}): ReactNode {
  const cards = handoffCardsOf(props.message);

  if (cards.length === 0) return null;

  return (
    <ul aria-label="Handoffs" className="grid gap-2">
      {cards.map(({ callId, data }) => (
        <li key={callId}>
          <HandoffCard card={data} labels={props.labels} />
        </li>
      ))}
    </ul>
  );
}

/** The files an answer asked for, after its artifacts (R-44a). */
function FileCards(props: {
  readonly message: AgentMessage;
  readonly files: readonly AgentFile[];
  readonly onDownload: (id: string) => Promise<string>;
}): ReactNode {
  const calls = fileCallsOf(props.message);

  if (calls.length === 0) return null;

  return (
    <ul aria-label="Files" className="grid gap-2">
      {calls.map((call) => (
        <li key={call.toolCallId}>
          <FileCard
            title={call.title}
            format={call.format}
            file={props.files.find(
              ({ toolCallId }) => toolCallId === call.toolCallId
            )}
            onDownload={props.onDownload}
          />
        </li>
      ))}
    </ul>
  );
}

/** One message of an agent chat. */
export function MessageParts(props: {
  readonly message: AgentMessage;
  readonly streaming: boolean;
  /** The words for module tools and dataset titles; without them a step reads "Used a tool". */
  readonly labels?: ChatLabels;
  /** A finished answer's time for the steps strip. */
  readonly durationMs?: number | undefined;
  /** Sends the question again after a final refusal. */
  readonly onTryAgain?: (() => void) | undefined;
  /**
   * Sends a question of Ask next or an offered choice. Conversation sets it only on the last
   * answer, after it ended, while no run builds and no refusal shows.
   */
  readonly onAsk?: ((question: string) => void) | undefined;
  /** What an artifact card does; undefined shows no card. */
  readonly artifacts?: ArtifactCardAction | undefined;
  /** The chat's list files; a `make-file` call shows its file's card and job state. */
  readonly files?: readonly AgentFile[] | undefined;
  /** Answers a download link for a file id; undefined shows no file card. */
  readonly onDownload?: ((id: string) => Promise<string>) | undefined;
}): ReactNode {
  const body = useRef<HTMLDivElement>(null);

  const { message, streaming } = props;

  // The last answer text proposes what to ask next; none while it streams.
  const next = useMemo(() => {
    if (streaming || message.role === "user") return [];

    const notes = stepNotes(message);

    return nextOf(
      message.parts.findLast(
        (part, index): part is Extract<typeof part, { type: "text" }> =>
          part.type === "text" && !notes.has(index)
      )?.text
    );
  }, [message, streaming]);

  if (props.message.role === "user") {
    return (
      <div className="grid gap-2">
        {props.message.parts.map((part, index) =>
          part.type === "text" ? (
            <p key={index} className="whitespace-pre-wrap">
              {part.text}
            </p>
          ) : null
        )}
      </div>
    );
  }

  const labels = props.labels ?? NO_LABELS;

  const notes = stepNotes(props.message);

  const answered =
    !props.streaming &&
    props.message.parts.some(
      (part, index) => part.type === "text" && !notes.has(index)
    );

  const files = props.files ?? NO_FILES;

  const offer = choicesOf(props.message);

  return (
    <StepTimeline
      parts={props.message.parts}
      labels={labels}
      streaming={props.streaming}
      durationMs={props.durationMs}
      onTryAgain={props.onTryAgain}
      files={Object.fromEntries(
        files.map(({ toolCallId, state }) => [toolCallId, state])
      )}
    >
      <div ref={body} className="grid gap-3 empty:hidden">
        {props.message.parts.map((part, index) =>
          part.type === "text" && !notes.has(index) ? (
            <AnswerText
              key={index}
              text={part.text}
              streaming={props.streaming}
            />
          ) : null
        )}
      </div>
      {offer === undefined ? null : (
        <ChoiceButtons
          question={offer.question}
          choices={offer.choices}
          onPick={props.onAsk}
        />
      )}
      <HandoffCards message={props.message} labels={labels} />
      {props.artifacts === undefined ? null : (
        <ArtifactCards
          message={props.message}
          action={props.artifacts}
          ready={!props.streaming}
        />
      )}
      {props.onDownload === undefined ? null : (
        <FileCards
          message={props.message}
          files={files}
          onDownload={props.onDownload}
        />
      )}
      {isStopped(props.message) ? (
        <p className="text-sm text-muted-foreground">
          Stopped. Ask again when you are ready.
        </p>
      ) : null}
      {answered ? (
        <AnswerMeta
          parts={props.message.parts}
          labels={labels}
          action={props.artifacts}
          answer={() => body.current?.innerText ?? ""}
        />
      ) : null}
      {answered && props.onAsk !== undefined && next.length > 0 ? (
        <div className="mt-2 grid gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Ask next
          </p>
          <QuestionPills
            label="Ask next"
            questions={next}
            onPick={props.onAsk}
          />
        </div>
      ) : null}
    </StepTimeline>
  );
}
