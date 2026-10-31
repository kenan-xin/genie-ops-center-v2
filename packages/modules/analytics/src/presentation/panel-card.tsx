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

import type { DashboardChange } from "../contract.ts";
import { convertibleTypes, convertPanel } from "./panel-convert.ts";
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
const spanOf = (columns: number) =>
  COLUMN_SPAN[columns as keyof typeof COLUMN_SPAN];

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
  readonly panel: PanelView;
  readonly index: number;
  readonly count: number;
  readonly timeZone: string;
  readonly editing: boolean;
  readonly onChange: (
    panel: PanelView,
    changes: readonly DashboardChange[]
  ) => void;
  readonly onRename: (panel: PanelView) => void;
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
    onChange,
    onRename,
  } = props;

  const query = usePanelData(dashboard, panel.id);

  return (
    <div
      className={`grid ${spanOf(panel.layout.columns)} ${heightOf(panel.layout.rows)}`}
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
