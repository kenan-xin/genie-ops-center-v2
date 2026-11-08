"use client";

import { Button, focusRing } from "@genie/ui";
import { Chart } from "@genie/ui/chart";
import type { ChartColumn, ChartData } from "@genie/ui/chart-data";
import { ArrowLeftIcon, TableIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ChatLabels } from "../../services/agent/index.ts";
import { fmtDate } from "../audit/helpers.ts";
import { columnLabel, type Read, rowsText } from "./answer-sources.ts";

/**
 * The table of a read's own rows, labelled as the method labels them. A money column without its
 * own currency takes the dataset's currency field, when the read selected it, as the chart gate's
 * `tableColumns` does.
 */
function rowsData(read: Read, labels: ChatLabels): ChartData {
  const fields = labels.fields[read.dataset] ?? {};

  const columns = read.columns.map((column): ChartColumn => {
    const { name, ...facts } = column;

    // A chart reads an instant as text (LH2), so no sum or axis treats it as a number.
    const chart: ChartColumn = {
      ...facts,
      type: facts.type === "instant" ? "text" : facts.type,
      key: name,
      label: columnLabel(read, name, labels),
    };

    const currencyKey = Object.hasOwn(fields, name)
      ? fields[name]?.currencyKey
      : undefined;

    return column.type === "money" &&
      column.currency === undefined &&
      currencyKey !== undefined &&
      read.columns.some((entry) => entry.name === currencyKey)
      ? { ...chart, currencyKey }
      : chart;
  });

  return {
    kind: "table",
    title: labels.datasets[read.dataset] ?? read.dataset,
    columns,
    rows: read.rows,
    datasets: [read.dataset],
    sources: [labels.datasets[read.dataset] ?? read.dataset],
    // The tool's output keeps only the reporting day; the caption below shows the source only.
    readAt: read.readAt ?? `${read.asOf}T00:00:00Z`,
    truncated: read.truncated,
  };
}

/**
 * The rows one read of an answer returned (czjw.108, method-fold variant A), from the answer
 * itself: it reads nothing. Ask shows it in the artifact's place, a column from 1280 px and a
 * sheet below.
 */
export function ReadRowsPanel(props: {
  readonly read: Read;
  readonly labels: ChatLabels;
  readonly variant: "column" | "sheet";
  readonly timeZone: string;
  readonly onClose: () => void;
}): ReactNode {
  const { read, labels } = props;

  const title = labels.datasets[read.dataset] ?? read.dataset;

  const data = rowsData(read, labels);

  const close =
    props.variant === "column" ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close the rows"
        onClick={props.onClose}
      >
        <XIcon aria-hidden="true" />
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to the chat"
        onClick={props.onClose}
      >
        <ArrowLeftIcon aria-hidden="true" />
      </Button>
    );

  return (
    <section
      aria-label="Rows"
      className="flex h-full min-h-0 flex-col bg-card text-card-foreground"
    >
      <header className="flex items-start gap-2 border-b border-border p-3">
        {props.variant === "sheet" ? (
          close
        ) : (
          <span
            aria-hidden="true"
            className="mt-1 grid size-8 shrink-0 place-items-center rounded-md bg-tile"
          >
            <TableIcon className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            Rows read from {title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {rowsText(read.rows.length, read.truncated)} · as of{" "}
            {fmtDate(read.asOf, "UTC")} · the rows this answer used
          </p>
        </div>
        {props.variant === "column" ? close : null}
      </header>

      {/* Focusable, so a keyboard scrolls a long list that holds no link (WCAG 2.1.1). */}
      <div
        role="group"
        aria-label={`Rows read from ${title}`}
        tabIndex={0}
        className={`grid min-h-0 flex-1 content-start gap-3 overflow-auto p-4 ${focusRing}`}
      >
        <p className="text-sm text-muted-foreground">
          {read.query.groupBy === undefined || read.query.groupBy.length === 0
            ? "Each row is one record."
            : "Each row is one group."}
        </p>
        <Chart {...data} timeZone={props.timeZone} caption="source" />
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        From the answer itself, not a new read.
      </footer>
    </section>
  );
}
