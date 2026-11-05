"use client";

import { Skeleton } from "@genie/ui";
import { Chart } from "@genie/ui/chart";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AppError, type AppErrorIssue } from "../../lib/errors/index.ts";
import { appErrorData } from "../../lib/rpc/index.ts";
import { checkPanelConfig } from "../../services/charts/panel-config.ts";
import { PageLink } from "../shell/page-link.tsx";
import { useChartCheck } from "./chart-check.tsx";
import { moreText } from "./short-list.tsx";

/**
 * A panel config drawn through the S7-04 gate as the viewer (R-45): the inline `Chart` of an answer
 * and the artifact panel draw one way. Its numbers come from the gate, never from the config.
 */

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

/**
 * The gate's answer for a raw config. One key per config, so the panel's Copy and its chart share
 * one gate call. `enabled` false waits, as a streaming answer does.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the model's raw panel config; the gate is its parser
export function useGatedChart(config: unknown, enabled = true) {
  const { check } = useChartCheck();
  const parsed = checkPanelConfig(config).config;

  const query = useQuery({
    queryKey: [
      "agent-chart",
      parsed === undefined ? null : JSON.stringify(parsed),
    ],
    queryFn: () => check(parsed),
    retry: false,
    enabled: enabled && parsed !== undefined,
  });

  return { config: parsed, query };
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

export function GatedChart(props: {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the model's raw panel config; the gate is its parser
  readonly config: unknown;
  readonly streaming?: boolean;
  /** `source` drops the read time from the caption, where the frame names it once. */
  readonly caption?: "full" | "source";
  /** A table with more rows draws only its first `limit`, then how many more (R-44a). */
  readonly limit?: number;
}): ReactNode {
  const { timeZone, datasetTitles } = useChartCheck();
  const streaming = props.streaming === true;
  const { config, query } = useGatedChart(props.config, !streaming);

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

  const { data } = query.data;

  const limit = props.limit;

  const hidden =
    limit === undefined || data.kind !== "table" ? 0 : data.rows.length - limit;

  // The record paths go by row index, and the first rows keep their index.
  const rows = hidden > 0 ? data.rows.slice(0, limit) : data.rows;

  return (
    // oxlint-disable-next-line shadcn/no-unknown-classes -- Typeset's opt-out class arrives with typeset.css (Task 10)
    <div className="not-typeset grid gap-2">
      <Chart
        {...data}
        rows={rows}
        datasets={data.datasets.map((name) => datasetTitles[name] ?? name)}
        timeZone={timeZone}
        linkComponent={PageLink}
        {...(props.caption === undefined ? {} : { caption: props.caption })}
      />
      {hidden > 0 ? (
        <p className="text-sm text-muted-foreground">
          {moreText(hidden, data.truncated)}. Ask for the full list.
        </p>
      ) : null}
    </div>
  );
}
