"use client";

import type { ChartData } from "@genie/ui";
import { chartCaption, formatChartValue } from "@genie/ui/chart-data";
import { type ReactNode, useId } from "react";

import {
  type Box,
  cn,
  type CssVars,
  figureBoxes,
  fitFontPx,
  LOOK_PX,
  placed,
} from "./slide-layout.ts";

/** A figure on a slide: the number in the accent, its currency code as a small raised run, the label and the source (P14-16). */
export function SlideFigure(props: {
  readonly data: ChartData;
  /** The drawing area at the origin: the element's box inside its frame padding. */
  readonly box: Box;
  readonly paired: boolean;
  /** The second figure of a pair: its number in the text color and its rule in the second rule color. */
  readonly second: boolean;
  readonly timeZone: string;
}): ReactNode {
  const { data, box, paired, second, timeZone } = props;
  const labelId = useId();
  const column = data.columns[0];
  const row = data.rows[0];

  const value =
    column === undefined || row === undefined
      ? null
      : (row[column.key] ?? null);

  // A sum over no records has no value; the figure says so, as the chart's empty state did.
  const number =
    value === null || column === undefined || row === undefined
      ? "No data"
      : formatChartValue(column, value, { row, bare: true });

  const code =
    value === null || column?.type !== "money" ? "" : (column.currency ?? "");

  const max = paired ? LOOK_PX.pairNumber : LOOK_PX.bigNumber;

  const size = fitFontPx({
    texts: [code + number],
    width: box.w,
    height: max,
    maxPx: max,
    minPx: 24,
    lineHeight: 1,
  });

  const parts = figureBoxes(box, size, paired);

  const figureStyle: CssVars = {
    "--fig-px": `${size}px`,
    "--fig-code-size": "0.36em",
    "--fig-code-rise": "-0.95em",
    "--fig-label": `${LOOK_PX.figureLabel}px`,
    "--fig-caption": `${LOOK_PX.caption}px`,
  };

  return (
    <figure
      aria-labelledby={labelId}
      className="relative h-full w-full"
      style={figureStyle}
    >
      {parts.rule === null ? null : (
        <div
          aria-hidden="true"
          data-figure-rule=""
          {...placed(
            parts.rule,
            second ? "bg-(--slide-rule)" : "bg-(--slide-accent)"
          )}
        />
      )}
      <p
        data-figure-number=""
        {...placed(
          parts.number,
          cn(
            "text-(length:--fig-px) leading-none font-(--slide-number-weight) tracking-tight whitespace-nowrap proportional-nums",
            second ? "text-foreground" : "text-(color:--slide-accent)"
          )
        )}
      >
        {code === "" ? null : (
          <span className="relative top-(--fig-code-rise) text-(length:--fig-code-size) tracking-normal">{`${code} `}</span>
        )}
        {number}
      </p>
      {/* The label and the source flow down from the label's place, so a wrapped line never runs into the next. */}
      <div
        {...placed(
          { ...parts.label, h: box.h - parts.label.y },
          "flex flex-col gap-1"
        )}
      >
        <p
          id={labelId}
          data-figure-label=""
          className="text-(length:--fig-label) leading-(--slide-leading-text) font-semibold wrap-anywhere text-muted-foreground"
        >
          {data.title}
        </p>
        <p className="text-(length:--fig-caption) leading-(--slide-leading-text) wrap-anywhere text-muted-foreground">
          {chartCaption(data, timeZone)}
        </p>
      </div>
    </figure>
  );
}
