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
          // 32 px, held to the title's line, so edit mode moves nothing (czjw.206).
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-1.5"
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
          Delete panel
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
          {/* czjw.206, prototype `.ph`: the title first, then its own range and, in edit mode, its menu. */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 font-semibold">
              {panel.config.title}
            </h2>
            {panel.ownRange === undefined && !editing ? null : (
              <span className="flex shrink-0 items-center gap-1.5">
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
                {editing ? (
                  <PanelActions
                    panel={panel}
                    index={index}
                    count={count}
                    onChange={(changes) => onChange(panel, changes)}
                    onRename={() => onRename(panel)}
                  />
                ) : null}
              </span>
            )}
          </div>
          {skipped.length === 0 ? null : (
            <div className="mt-1 grid gap-0.5">
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
          )}
          {query.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {query.error.message === ""
                ? "This panel could not be drawn."
                : query.error.message}
            </p>
          ) : query.data === undefined ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <>
              {/* The header names the panel; the figure keeps the title for a screen reader, as on a slide. */}
              <Chart
                {...query.data}
                timeZone={timeZone}
                caption="source"
                linkComponent={PageLink}
                titleHidden
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
