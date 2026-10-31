"use client";

import { PageLink } from "@genie/core/features/shell";
import { Card, CardContent } from "@genie/ui";
import { Chart } from "@genie/ui/chart";

import { usePanelData } from "./use-dashboard.ts";
import type { DashboardView, PanelView } from "./views.ts";

const COLUMN_SPAN = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
} as const;

const ROW_HEIGHT = {
  1: "min-h-40",
  2: "min-h-80",
} as const;

// SAFETY: `panelLayout` limits columns to 1 to 4 and rows to 1 or 2.
const spanOf = (columns: number) =>
  COLUMN_SPAN[columns as keyof typeof COLUMN_SPAN];

// SAFETY: `panelLayout` limits rows to 1 or 2.
const heightOf = (rows: number) => ROW_HEIGHT[rows as keyof typeof ROW_HEIGHT];

export type PanelCardProps = {
  readonly dashboard: DashboardView;
  readonly panel: PanelView;
  readonly timeZone: string;
};

/** One panel: its chart, or its own refusal so the other panels still draw (Review Focus 2). */
export function PanelCard(props: PanelCardProps) {
  const { dashboard, panel, timeZone } = props;
  const query = usePanelData(dashboard, panel.id);

  return (
    <div
      className={`grid ${spanOf(panel.layout.columns)} ${heightOf(panel.layout.rows)}`}
    >
      <Card>
        <CardContent>
          {query.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {query.error.message === ""
                ? "This panel could not be drawn."
                : query.error.message}
            </p>
          ) : query.data === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <Chart
              {...query.data}
              timeZone={timeZone}
              linkComponent={PageLink}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
