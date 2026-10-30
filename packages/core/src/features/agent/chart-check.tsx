"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CheckedChart } from "../../services/charts/index.ts";

/** The chart gate as a browser calls it: an answer's raw config in, checked data or a refusal out. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the model's raw panel config; the S7-04 gate is its parser
export type CheckChart = (config: unknown) => Promise<CheckedChart>;

type ChartCheckContextValue = {
  readonly check: CheckChart;
  /** The viewer's zone for a chart's read-time caption, from `branding.defaultTimeZone`. */
  readonly timeZone: string;
};

const ChartCheckContext = createContext<ChartCheckContextValue | null>(null);

/** Supplies the gate call and the viewer's zone for the Chart view (R-45). */
export function ChartCheckProvider(props: {
  readonly check: CheckChart;
  readonly timeZone: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ChartCheckContext.Provider
      value={{ check: props.check, timeZone: props.timeZone }}
    >
      {props.children}
    </ChartCheckContext.Provider>
  );
}

/** The gate call and time zone of the nearest provider. */
export function useChartCheck(): ChartCheckContextValue {
  const value = useContext(ChartCheckContext);

  if (value === null) throw new Error("A Chart needs a ChartCheckProvider.");

  return value;
}
