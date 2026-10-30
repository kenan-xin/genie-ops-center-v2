"use client";

import {
  Renderer,
  type OpenUIError,
  type ParseResult,
} from "@openuidev/react-lang";
import { useState, type ReactNode } from "react";

import type { AgentMessage } from "../../services/agent/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { ANSWER_LIBRARY } from "./answer-library.tsx";

/**
 * The one message-part renderer (Spec 7 R-45, DEC-29). A user message is plain text. An assistant
 * message draws each text part through the answer catalog, one tool call as one muted line, and
 * skips step markers. A part the parser cannot read shows its text as a paragraph; a part that
 * failed shows what it could draw and one repair line.
 */

type MessagePart = AgentMessage["parts"][number];

function toolNameOf(part: MessagePart): string | null {
  if (part.type === "dynamic-tool") return part.toolName;

  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the tool input is untyped UI data; this reads a display label only
function datasetOf(input: unknown): string | undefined {
  // SAFETY: the query-dataset tool's input is `{ dataset: string }`; this reads a label only.
  const dataset = (input as { readonly dataset?: unknown }).dataset;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display label, not a parse
  return typeof dataset === "string" ? dataset : undefined;
}

function toolLine(part: MessagePart, name: string): string {
  if ("state" in part && part.state === "output-error") return "refused";

  if (name === "list-datasets") return "Read the datasets";

  if (name === "open-record") return "Opened a record";

  if (name === "query-dataset") {
    return `Queried ${"input" in part ? (datasetOf(part.input) ?? "a dataset") : "a dataset"}`;
  }

  return name;
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
  streaming: boolean
): ReactNode {
  if (part.type === "text") {
    return <AnswerText key={index} text={part.text} streaming={streaming} />;
  }

  if (part.type === "step-start") return null;

  const name = toolNameOf(part);

  return name === null ? null : (
    <p key={index} className="text-muted-foreground text-sm">
      {toolLine(part, name)}
    </p>
  );
}

/** One message of an agent chat. */
export function MessageParts(props: {
  readonly message: AgentMessage;
  readonly streaming: boolean;
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
        assistantPart(part, index, props.streaming)
      )}
    </div>
  );
}
