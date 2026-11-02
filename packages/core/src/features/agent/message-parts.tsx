"use client";

import {
  Marker,
  MarkerContent,
  MarkerIcon,
  Spinner,
  focusRing,
} from "@genie/ui";
import {
  Renderer,
  type OpenUIError,
  type ParseResult,
} from "@openuidev/react-lang";
import { CheckIcon, CircleSlashIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { ANSWER_LIBRARY } from "./answer-library.tsx";
import { stepLine, toolNameOf } from "./step-line.ts";

/**
 * The one message-part renderer (Spec 7 R-45, DEC-29). A user message is plain text. An assistant
 * message draws each text part through the answer catalog, one tool call as one human step line
 * with its object in bold (agent-native rule 3, design review 6.3), and skips step markers. A part
 * the parser cannot read shows its text as a paragraph; a part that failed shows what it could draw
 * and one repair line.
 */

type MessagePart = AgentMessage["parts"][number];

const NO_LABELS: ChatLabels = { steps: {}, datasets: {} };

const chipClass = `inline-flex min-h-8 cursor-pointer list-none items-center rounded-full border border-border bg-muted px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground ${focusRing}`;

function stepIcon(part: MessagePart, streaming: boolean): ReactNode {
  if (!("state" in part)) return null;

  if (part.state === "output-available")
    return <CheckIcon strokeWidth={1.75} />;

  if (part.state === "output-error") {
    return <CircleSlashIcon strokeWidth={1.75} />;
  }

  return streaming ? <Spinner label="Working" /> : null;
}

/** One tool call: a human line, and the query behind a chip that opens on demand (rule 3). */
function ToolStep(props: {
  readonly part: MessagePart;
  readonly name: string;
  readonly labels: ChatLabels;
  readonly streaming: boolean;
}): ReactNode {
  const line = stepLine(props.part, props.labels);

  const input =
    props.name === "query-dataset" &&
    "input" in props.part &&
    props.part.input !== undefined
      ? props.part.input
      : undefined;

  return (
    <div className="grid gap-1">
      <Marker>
        <MarkerIcon>{stepIcon(props.part, props.streaming)}</MarkerIcon>
        <MarkerContent>
          {line.text}
          {line.object === undefined ? null : (
            <>
              {" "}
              <b className="font-semibold text-foreground">{line.object}</b>
            </>
          )}
          {line.refused ? " (refused)" : null}
        </MarkerContent>
      </Marker>
      {input === undefined ? null : (
        <details className="ps-6 text-sm">
          <summary className={chipClass}>Query used</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs">
            {JSON.stringify(input, null, 2)}
          </pre>
        </details>
      )}
    </div>
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

function assistantPart(
  part: MessagePart,
  index: number,
  streaming: boolean,
  labels: ChatLabels
): ReactNode {
  if (part.type === "text") {
    return <AnswerText key={index} text={part.text} streaming={streaming} />;
  }

  if (part.type === "step-start") return null;

  const name = toolNameOf(part);

  return name === null ? null : (
    <ToolStep
      key={index}
      part={part}
      name={name}
      labels={labels}
      streaming={streaming}
    />
  );
}

/** One message of an agent chat. */
export function MessageParts(props: {
  readonly message: AgentMessage;
  readonly streaming: boolean;
  /** The words for module tools and dataset titles; without them a step reads "Used a tool". */
  readonly labels?: ChatLabels;
}): ReactNode {
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

  return (
    <div className="grid gap-3">
      {props.message.parts.map((part, index) =>
        assistantPart(part, index, props.streaming, props.labels ?? NO_LABELS)
      )}
    </div>
  );
}
