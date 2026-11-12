"use client";

import "./openui-devtools-off.ts";
import {
  type ComponentRenderProps,
  useIsStreaming,
} from "@openuidev/react-lang";
import { Fragment } from "react";

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
    // The result first: the first paragraph is the lead, later ones the quiet supporting lines
    // (czjw.120 item 4). renderNode gives no class hook, so the child selectors style them.
    <div className="grid gap-3 [&>p:first-child]:text-lg [&>p:first-child]:leading-snug [&>p:first-child]:font-semibold [&>p:not(:first-child)]:text-muted-foreground">
      {children.map((child, index) => (
        <Fragment key={index}>{renderNode(child)}</Fragment>
      ))}
    </div>
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

  return <p className="whitespace-pre-wrap">{text}</p>;
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
        <li key={index}>{item}</li>
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
