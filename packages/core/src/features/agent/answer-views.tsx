"use client";

import "./openui-devtools-off.ts";
import {
  type ComponentRenderProps,
  useIsStreaming,
} from "@openuidev/react-lang";
import { Fragment } from "react";

import { boldRuns } from "./bold-runs.ts";
import type { AnswerViews } from "./catalog.ts";
import { GatedChart } from "./gated-chart.tsx";
import { SHORT_LIST_ROWS } from "./short-list.tsx";

/**
 * The views of the answer catalog (Spec 7 R-45, P10). The catalog's type takes untyped renderers,
 * and `defineComponent` validates each view's props with the catalog's schema before it renders,
 * so a view narrows its props here. A chart holds only a panel config; its numbers come from the
 * S7-04 gate as the viewer, never from the answer text.
 */

type ViewProps = ComponentRenderProps;

function AnswerView({ props, renderNode }: ViewProps) {
  // SAFETY: defineComponent validated `children` against the catalog's Answer schema.
  const { children } = props as { readonly children: readonly unknown[] };

  return (
    // One body size and the foreground color for the whole answer (czjw.184): the result-first rule
    // lives in the words, not in the styling.
    <div className="grid gap-3">
      {children.map((child, index) => (
        <Fragment key={index}>{renderNode(child)}</Fragment>
      ))}
    </div>
  );
}

/** An answer text with its marked key figure or name in bold (czjw.184). */
function Runs(props: { readonly text: string }) {
  return boldRuns(props.text).map((run, index) =>
    run.strong ? (
      <strong key={index}>{run.text}</strong>
    ) : (
      <Fragment key={index}>{run.text}</Fragment>
    )
  );
}

function HeadingView({ props }: ViewProps) {
  // SAFETY: defineComponent validated `text` and `level` against the catalog's Heading schema.
  const { text, level } = props as {
    readonly text: string;
    readonly level?: 2 | 3;
  };

  const Tag = level === 3 ? "h3" : "h2";

  return <Tag>{text}</Tag>;
}

function ParagraphView({ props }: ViewProps) {
  // SAFETY: defineComponent validated `text` against the catalog's Paragraph schema.
  const { text } = props as { readonly text: string };

  return (
    <p className="whitespace-pre-wrap">
      <Runs text={text} />
    </p>
  );
}

function ListView({ props }: ViewProps) {
  // SAFETY: defineComponent validated `items` and `ordered` against the catalog's List schema.
  const { items, ordered } = props as {
    readonly items: readonly string[];
    readonly ordered?: boolean;
  };

  const Tag = ordered === true ? "ol" : "ul";

  return (
    <Tag className={ordered === true ? "list-decimal ps-5" : "list-disc ps-5"}>
      {items.map((item, index) => (
        <li key={index}>
          <Runs text={item} />
        </li>
      ))}
    </Tag>
  );
}

function ChartView({ props }: ViewProps) {
  const streaming = useIsStreaming();

  return (
    <GatedChart
      config={props.config}
      streaming={streaming}
      limit={SHORT_LIST_ROWS}
    />
  );
}

export const ANSWER_VIEWS = {
  Answer: AnswerView,
  Heading: HeadingView,
  Paragraph: ParagraphView,
  List: ListView,
  Chart: ChartView,
} satisfies AnswerViews;
