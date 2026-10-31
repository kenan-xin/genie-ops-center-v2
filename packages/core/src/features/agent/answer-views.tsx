"use client";

import { Skeleton } from "@genie/ui";
import { Chart } from "@genie/ui/chart";
import {
  type ComponentRenderProps,
  useIsStreaming,
} from "@openuidev/react-lang";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";

import { AppError, type AppErrorIssue } from "../../lib/errors/index.ts";
import { appErrorData } from "../../lib/rpc/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { PageLink } from "../shell/page-link.tsx";
import type { AnswerViews } from "./catalog.ts";
import { useChartCheck } from "./chart-check.tsx";

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
    <div className="grid gap-3">
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

type Refusal = { readonly issue: string | undefined };

function firstIssue(
  issues: readonly AppErrorIssue[] | undefined
): string | undefined {
  return issues?.[0]?.message;
}

/** `chart-invalid` and `forbidden` as the gate raises them, or as the RPC transport carries them. */
function refusalOf(cause: unknown): Refusal | null {
  if (cause instanceof AppError) {
    return { issue: firstIssue(cause.issues) };
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- an RPC transport error is untyped here; a primitive carries no payload
  if (typeof cause !== "object" || cause === null || !("data" in cause)) {
    return null;
  }

  const parsed = appErrorData.safeParse(cause.data);

  if (!parsed.success) return null;

  return parsed.data.appCode === "chart-invalid" ||
    parsed.data.appCode === "forbidden"
    ? { issue: parsed.data.issues?.[0]?.message }
    : null;
}

function ChartLoading(props: { readonly title: string }) {
  return (
    <div className="grid gap-2">
      <div className="font-semibold">{props.title}</div>
      <div className="grid h-24">
        <Skeleton className="w-full" />
      </div>
    </div>
  );
}

function ChartRefused(props: { readonly issue: string | undefined }) {
  return (
    <div className="grid gap-2">
      <p>This chart could not be drawn.</p>
      {props.issue === undefined ? null : (
        <p className="text-muted-foreground text-sm">{props.issue}</p>
      )}
    </div>
  );
}

function ChartView({ props }: ViewProps) {
  const streaming = useIsStreaming();
  const { check, timeZone } = useChartCheck();
  const { config } = checkPanelConfig(props.config);

  const query = useQuery({
    queryKey: [
      "agent-chart",
      config === undefined ? null : JSON.stringify(config),
    ],
    queryFn: () => check(config),
    retry: false,
    enabled: !streaming && config !== undefined,
  });

  if (config === undefined) return null;

  if (streaming || query.isPending) {
    return (
      // oxlint-disable-next-line shadcn/no-unknown-classes -- Typeset's opt-out class arrives with typeset.css (Task 10)
      <div className="not-typeset">
        <ChartLoading title={config.title} />
      </div>
    );
  }

  if (query.isError) {
    return (
      // oxlint-disable-next-line shadcn/no-unknown-classes -- Typeset's opt-out class arrives with typeset.css (Task 10)
      <div className="not-typeset">
        <ChartRefused issue={refusalOf(query.error)?.issue} />
      </div>
    );
  }

  return (
    // oxlint-disable-next-line shadcn/no-unknown-classes -- Typeset's opt-out class arrives with typeset.css (Task 10)
    <div className="not-typeset">
      <Chart
        {...query.data.data}
        timeZone={timeZone}
        linkComponent={PageLink}
      />
    </div>
  );
}

export const ANSWER_VIEWS = {
  Answer: AnswerView,
  Heading: HeadingView,
  Paragraph: ParagraphView,
  List: ListView,
  Chart: ChartView,
} satisfies AnswerViews;
