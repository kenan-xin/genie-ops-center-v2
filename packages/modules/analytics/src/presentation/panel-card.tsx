"use client";

import type { ChartType } from "@genie/core";
import { PageLink } from "@genie/core/features/shell";
import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@genie/ui";
import { Chart } from "@genie/ui/chart";
import { CalendarIcon, InfoIcon } from "lucide-react";
import { useEffect } from "react";

import { DATE_RANGE_PRESETS, type DashboardChange } from "../contract.ts";
import { notApplied } from "./not-applied.ts";
import { convertibleTypes, convertPanel } from "./panel-convert.ts";
import { PRESET_LABEL, rangeLabel } from "./range-label.ts";
import { type DashboardFilterState, usePanelData } from "./use-dashboard.ts";
import type { DashboardView, PanelView } from "./views.ts";

const COLUMN_SPAN = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
} as const;

/** Beside the docked chat the grid has two columns from xl, so a span never exceeds it. */
const COLUMN_SPAN_NARROW = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3 xl:col-span-2",
  4: "md:col-span-4 xl:col-span-2",
} as const;

const ROW_HEIGHT = {
  1: "min-h-40",
  2: "min-h-80",
} as const;

const TYPE_LABEL: Record<ChartType, string> = {
  kpi: "KPI",
  bar: "Bar",
  line: "Line",
  area: "Area",
  donut: "Donut",
  table: "Table",
};

const COLUMNS = [1, 2, 3, 4] as const;

const HEIGHTS = [
  { rows: 1, label: "Short" },
  { rows: 2, label: "Tall" },
] as const;

// SAFETY: `panelLayout` limits columns to 1 to 4 and rows to 1 or 2.
const spanOf = (columns: number, narrow: boolean) =>
  (narrow ? COLUMN_SPAN_NARROW : COLUMN_SPAN)[
    columns as keyof typeof COLUMN_SPAN
  ];

// SAFETY: `panelLayout` limits rows to 1 or 2.
const heightOf = (rows: number) => ROW_HEIGHT[rows as keyof typeof ROW_HEIGHT];

type PanelActionsProps = {
  readonly panel: PanelView;
  readonly index: number;
  readonly count: number;
  readonly onChange: (changes: readonly DashboardChange[]) => void;
  readonly onRename: () => void;
};

/** The hand edits of one panel, each one change (D4, R-49). */
function PanelActions(props: PanelActionsProps) {
  const { panel, index, count, onChange, onRename } = props;
  const types = convertibleTypes(panel.config);
  const layout = panel.layout;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${panel.config.title}`}
          />
        }
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>Rename panel</DropdownMenuItem>
        {types.length === 0 ? null : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Chart type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {types.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() =>
                    onChange([
                      {
                        op: "change-panel",
                        panelId: panel.id,
                        panel: convertPanel(panel.config, type),
                      },
                    ])
                  }
                >
                  {TYPE_LABEL[type]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Width</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {COLUMNS.map((columns) => (
              <DropdownMenuItem
                key={columns}
                // The current size would save a no-op and spend an Undo entry.
                disabled={columns === layout.columns}
                onClick={() =>
                  onChange([
                    {
                      op: "change-panel",
                      panelId: panel.id,
                      layout: { ...layout, columns },
                    },
                  ])
                }
              >
                {columns === 1 ? "1 column" : `${columns} columns`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Height</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {HEIGHTS.map((height) => (
              <DropdownMenuItem
                key={height.rows}
                disabled={height.rows === layout.rows}
                onClick={() =>
                  onChange([
                    {
                      op: "change-panel",
                      panelId: panel.id,
                      layout: { ...layout, rows: height.rows },
                    },
                  ])
                }
              >
                {height.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Date range</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              // The dashboard range is the panel's own until it picks one.
              disabled={panel.ownRange === undefined}
              onClick={() =>
                onChange([
                  { op: "change-panel", panelId: panel.id, ownRange: null },
                ])
              }
            >
              Use the dashboard range
            </DropdownMenuItem>
            {DATE_RANGE_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset}
                disabled={
                  panel.ownRange !== undefined &&
                  "preset" in panel.ownRange &&
                  panel.ownRange.preset === preset
                }
                onClick={() =>
                  onChange([
                    {
                      op: "change-panel",
                      panelId: panel.id,
                      ownRange: { preset },
                    },
                  ])
                }
              >
                {PRESET_LABEL[preset]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          disabled={index === 0}
          onClick={() =>
            onChange([
              { op: "move-panel", panelId: panel.id, toIndex: index - 1 },
            ])
          }
        >
          Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === count - 1}
          onClick={() =>
            onChange([
              { op: "move-panel", panelId: panel.id, toIndex: index + 1 },
            ])
          }
        >
          Move later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onChange([{ op: "remove-panel", panelId: panel.id }])}
        >
          Remove panel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type PanelCardProps = {
  readonly dashboard: DashboardView;
  /** The filters the page applies (S7-46). */
  readonly filters: DashboardFilterState;
  readonly panel: PanelView;
  readonly index: number;
  readonly count: number;
  readonly timeZone: string;
  readonly editing: boolean;
  /** True when the chat column shares the row, so the grid is narrower. */
  readonly narrow: boolean;
  readonly onChange: (
    panel: PanelView,
    changes: readonly DashboardChange[]
  ) => void;
  readonly onRename: (panel: PanelView) => void;
  /** Each read's instant, so the page names the figures' time once (6.1). */
  readonly onRead: (readAt: string) => void;
};

/** One panel: its chart, its own refusal so the other panels still draw (Review Focus 2). */
export function PanelCard(props: PanelCardProps) {
  const {
    dashboard,
    panel,
    index,
    count,
    timeZone,
    editing,
    narrow,
    onChange,
    onRename,
    onRead,
  } = props;

  const query = usePanelData(dashboard, panel.id, props.filters);
  const readAt = query.data?.readAt;

  useEffect(() => {
    if (readAt !== undefined) onRead(readAt);
  }, [readAt]);

  const skipped = notApplied(
    panel,
    props.filters.filters,
    dashboard.filterFields
  );

  return (
    <div
      className={`grid ${spanOf(panel.layout.columns, narrow)} ${heightOf(panel.layout.rows)}`}
    >
      <Card>
        <CardContent>
          {editing ? (
            <div className="mb-2 flex justify-end">
              <PanelActions
                panel={panel}
                index={index}
                count={count}
                onChange={(changes) => onChange(panel, changes)}
                onRename={() => onRename(panel)}
              />
            </div>
          ) : null}
          {/* What the panel's own header adds: a range it keeps, and the filters that skip it. */}
          {panel.ownRange === undefined && skipped.length === 0 ? null : (
            <div className="mb-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <div className="grid gap-0.5">
                {skipped.map(({ field, label }) => (
                  <p
                    key={field}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <InfoIcon
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="size-3.5 shrink-0"
                    />
                    {`The ${label} filter does not apply to this panel.`}
                  </p>
                ))}
              </div>
              {panel.ownRange === undefined ? null : (
                <span
                  title="This panel keeps its own range"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tile px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                >
                  <CalendarIcon
                    aria-hidden="true"
                    strokeWidth={1.75}
                    className="size-3.5 shrink-0"
                  />
                  {`${rangeLabel(panel.ownRange)} · own range`}
                </span>
              )}
            </div>
          )}
          {/* Without a chart there is no figure title, so name the panel here. */}
          {query.isError || query.data === undefined ? (
            <p className="mb-1 text-sm font-medium">{panel.config.title}</p>
          ) : null}
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
              caption="source"
              linkComponent={PageLink}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
