"use client";

import { Button } from "@genie/ui";
import {
  Renderer,
  type OpenUIError,
  type ParseResult,
} from "@openuidev/react-lang";
import { CopyIcon, DatabaseIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { ANSWER_LIBRARY } from "./answer-library.tsx";
import { methodLines, sourceTitles } from "./answer-sources.ts";
import { ArtifactCard, type ArtifactCardAction } from "./artifact-card.tsx";
import { artifactRefsOf } from "./artifact-refs.ts";
import { QuietFold } from "./chat-parts.tsx";
import { StepTimeline } from "./step-timeline.tsx";

/**
 * The one message-part renderer (Spec 7 R-45, DEC-29). A user message is plain text. An assistant
 * message draws its tool calls as the step timeline (czjw.81) above the answer, and each text part
 * through the answer catalog. A part the parser cannot read shows its text as a paragraph; a part
 * that failed shows what it could draw and one repair line.
 */

const NO_LABELS: ChatLabels = { steps: {}, datasets: {} };

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

/**
 * Under a finished answer (design review 5.1, 5.2): the datasets it read by title, Copy, and how
 * it counted in a closed fold, so the result reads first.
 */
function AnswerFooter(props: {
  readonly parts: AgentMessage["parts"];
  readonly labels: ChatLabels;
  readonly answer: () => string;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const sources = sourceTitles(props.parts, props.labels);
  const method = methodLines(props.parts, props.labels);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {sources.length === 0 ? null : (
          <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
            {sources.map((title) => (
              <li
                key={title}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 text-xs font-medium text-muted-foreground"
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // oxlint-disable-next-line shadcn/no-restyle -- Copy sits at the end of the source row (prototype `.srcs`)
          className="ms-auto"
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
      </div>
      {method.length === 0 ? null : (
        <QuietFold label="How this was counted">
          <ul className="grid gap-0.5 ps-5 text-muted-foreground">
            {method.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </QuietFold>
      )}
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
  /** What an artifact card does; undefined shows no card. */
  readonly artifacts?: ArtifactCardAction | undefined;
}): ReactNode {
  const body = useRef<HTMLDivElement>(null);

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

  const answered =
    !props.streaming &&
    props.message.parts.some((part) => part.type === "text");

  return (
    <StepTimeline
      parts={props.message.parts}
      labels={labels}
      streaming={props.streaming}
      durationMs={props.durationMs}
      onTryAgain={props.onTryAgain}
    >
      <div ref={body} className="grid gap-3 empty:hidden">
        {props.message.parts.map((part, index) =>
          part.type === "text" ? (
            <AnswerText
              key={index}
              text={part.text}
              streaming={props.streaming}
            />
          ) : null
        )}
      </div>
      {props.artifacts === undefined ? null : (
        <ArtifactCards
          message={props.message}
          action={props.artifacts}
          ready={!props.streaming}
        />
      )}
      {answered ? (
        <AnswerFooter
          parts={props.message.parts}
          labels={labels}
          answer={() => body.current?.innerText ?? ""}
        />
      ) : null}
    </StepTimeline>
  );
}
