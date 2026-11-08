"use client";

import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { useId, type ComponentType, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  type TooltipPayloadEntry,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/chart.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/tabs.tsx";
import { focusRing } from "../theme/tokens.ts";
import {
  chartCaption,
  formatChartValue,
  isChartEmpty,
  kpiChange,
  type ChartColumn,
  type ChartData,
  type ChartRow,
} from "./chart-data.ts";
import { DataTable, type DataTableColumn } from "./data-table.tsx";
import { EmptyState } from "./empty-state.tsx";

export type {
  ChartColumn,
  ChartData,
  ChartKind,
  ChartRow,
  ChartValue,
} from "./chart-data.ts";

/** The host's link, so a record row opens through the host's router. */
export type ChartLinkComponent = ComponentType<{
  readonly href: string;
  readonly className?: string;
  readonly children?: ReactNode;
}>;

export type ChartProps = ChartData & {
  readonly timeZone: string;
  /** Draws each link of `recordPaths`; a plain `a` when the host passes none. */
  readonly linkComponent?: ChartLinkComponent;
  /**
   * Slides: fill the parent height, keep a table a table at every viewport, and drop the Chart and
   * Table tabs (F1). The slide already chooses the kind, and the canvas is scaled rather than reflowed.
   */
  readonly slide?: boolean;
  /** `source` drops the read time from the caption, where the page names it once (6.1). */
  readonly caption?: "full" | "source";
};

function PlainLink(props: {
  readonly href: string;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <a href={props.href} className={props.className}>
      {props.children}
    </a>
  );
}

// The chart opts out of typeset, so a record link carries its own underline and the one ring (R-8).
const RECORD_LINK = `rounded-sm font-medium underline underline-offset-4 hover:text-primary ${focusRing}`;

/** Slot `index + 1` of tokens.md, "Chart series colors". */
function slot(index: number): string {
  return `var(--chart-${index + 1})`;
}

/** The internal data key of a series: a series name can hold any character. */
function seriesKey(index: number): string {
  return `s${index}`;
}

function isNumeric(column: ChartColumn): boolean {
  return column.type === "number" || column.type === "money";
}

function tableColumn(column: ChartColumn): DataTableColumn<ChartRow> {
  const base = {
    id: column.key,
    header: column.label,
    cell: (row: ChartRow) =>
      formatChartValue(column, row[column.key] ?? null, { row }),
  };

  return isNumeric(column) ? { ...base, align: "end" } : base;
}

/**
 * A slide's table: always the table layout, whatever the viewport, because the canvas is scaled and
 * not reflowed (F1). It is compact enough for 12 rows on a 348 px body, and it has no actions.
 */
function SlideTable(props: {
  readonly label: string;
  readonly columns: readonly ChartColumn[];
  readonly rows: readonly ChartRow[];
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{props.label}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th
                key={column.key}
                className="border-b border-border bg-muted px-2 py-0.5 text-left font-semibold text-muted-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              {props.columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-2 py-0.5 ${isNumeric(column) ? "text-right tabular-nums" : ""}`}
                >
                  {formatChartValue(column, row[column.key] ?? null, { row })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The values as a table, a card list under 768 px (tokens.md, "Tables and card lists"). */
function ChartTable(props: {
  readonly label: string;
  readonly columns: readonly ChartColumn[];
  readonly rows: readonly ChartRow[];
  readonly recordPaths: readonly (string | null)[] | undefined;
  readonly linkComponent: ChartLinkComponent;
}) {
  const [first, ...rest] = props.columns.map(tableColumn);
  const Link = props.linkComponent;

  const indexes = new Map(props.rows.map((row, index) => [row, index]));

  const pathOf = (row: ChartRow) =>
    props.recordPaths?.[indexes.get(row) ?? -1] ?? null;

  const titleOf = (row: ChartRow) => String(first?.cell(row) ?? "");

  // A card shows a column's one currency once, above the list, and its amounts bare (5.5).
  const byId = new Map(props.columns.map((column) => [column.key, column]));

  const currencies = [
    ...new Set(
      props.columns.flatMap((column) =>
        column.type === "money" && column.currency !== undefined
          ? [column.currency]
          : []
      )
    ),
  ];

  const cardCell = (id: string, row: ChartRow) => {
    const column = byId.get(id);

    return column === undefined
      ? ""
      : formatChartValue(column, row[column.key] ?? null, {
          row,
          bare: currencies.length === 1,
        });
  };

  // A row with a page links its first cell; a row without one, or without a name for the link,
  // keeps plain text (R-44).
  const linked = (row: ChartRow, className = RECORD_LINK) => {
    const path = pathOf(row);
    const title = titleOf(row);

    if (path === null || title === "") return title;

    return (
      <Link href={path} className={className}>
        {title}
      </Link>
    );
  };

  const columns =
    first === undefined
      ? rest
      : [{ ...first, cell: (row: ChartRow) => linked(row) }, ...rest];

  const table = (
    <DataTable
      label={props.label}
      rows={props.rows}
      rowKey={(row) => String(indexes.get(row) ?? "")}
      rowLabel={titleOf}
      columns={columns}
      card={{
        title: (row) =>
          linked(row, `${RECORD_LINK} after:absolute after:inset-0`),
        content: (row) => (
          <dl className="grid gap-1">
            {rest.map((column) => (
              <div key={column.id} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{column.header}</dt>
                <dd className="tabular-nums">{cardCell(column.id, row)}</dd>
              </div>
            ))}
          </dl>
        ),
      }}
    />
  );

  return currencies.length === 1 ? (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground md:hidden">
        Amounts in {currencies[0]}
      </p>
      {table}
    </div>
  ) : (
    table
  );
}

function CartesianPlot(props: ChartProps & { readonly x: ChartColumn }) {
  const { columns, x } = props;

  const data = props.rows.map((row) =>
    Object.fromEntries([
      ["x", row[x.key] ?? null],
      ...columns.map((column, index) => [
        seriesKey(index),
        row[column.key] ?? null,
      ]),
    ])
  );

  const byKey = new Map(
    columns.map((column, index) => [seriesKey(index), column])
  );

  const formatValue = (item: TooltipPayloadEntry) => {
    const column = byKey.get(String(item.dataKey));

    return column === undefined || item.value === undefined
      ? ""
      : formatChartValue(column, Number(item.value));
  };

  // React wants `key` passed directly, and a key in a spread logs an error to the console.
  const marks = columns.map((column, index) => {
    const key = seriesKey(index);

    const shared = {
      dataKey: seriesKey(index),
      name: column.label,
      // The motion tokens allow 150 to 220 ms, and a chart that animates longer reads as slow.
      isAnimationActive: false,
    };

    if (props.kind === "bar") {
      return <Bar key={key} {...shared} fill={slot(index)} radius={4} />;
    }

    return props.kind === "line" ? (
      <Line
        key={key}
        {...shared}
        type="monotone"
        stroke={slot(index)}
        strokeWidth={2}
        dot={{ fill: slot(index) }}
      />
    ) : (
      <Area
        key={key}
        {...shared}
        type="monotone"
        stroke={slot(index)}
        strokeWidth={2}
        fill={slot(index)}
        fillOpacity={0.15}
      />
    );
  });

  const Plot =
    props.kind === "bar"
      ? BarChart
      : props.kind === "line"
        ? LineChart
        : AreaChart;

  return (
    <ChartContainer fill={props.slide === true}>
      <Plot data={data} title={props.title} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        {/* Recharts' default `preserveEnd` hid any label that overlapped its neighbor, so a
            panel or phone chart lost months at random (czjw.106). Every label shows when the
            compact labels fit, and an even step from the first one when they do not. */}
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={false}
          interval="equidistantPreserveStart"
          tickFormatter={(value: string | number | null) =>
            value === null
              ? "No value"
              : formatChartValue(x, value, { compact: true })
          }
        />
        {/* The 60 px default cut a slide's base-size "SGD 60k". Off a slide, auto width measures
            the ticks. A slide is scaled with a CSS transform, which the measure reads, so it
            gets a fixed width in its 960 px canvas units.
            shortcut: 84 px fits a compact label of 9 characters at 15 px, such as "SGD 1.25M";
            measure the formatted ticks unscaled if a longer label appears. */}
        <YAxis
          width={props.slide === true ? 84 : "auto"}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) =>
            columns[0] === undefined
              ? String(value)
              : formatChartValue(columns[0], value, { compact: true })
          }
        />
        <ChartTooltip
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              formatLabel={(value) =>
                value === undefined ? "" : formatChartValue(x, value)
              }
              formatValue={formatValue}
            />
          )}
        />
        {/* A legend at the top of every multi-series chart (6.2). */}
        {columns.length > 1 ? (
          <ChartLegend
            verticalAlign="top"
            content={<ChartLegendContent verticalAlign="top" />}
          />
        ) : null}
        {marks}
      </Plot>
    </ChartContainer>
  );
}

/** A donut: one part per row, in row order, so a part keeps its slot (the gate refuses a ninth). */
function DonutPlot(props: ChartProps & { readonly x: ChartColumn }) {
  const value = props.columns[0];

  const data = props.rows.map((row, index) => {
    const name = row[props.x.key] ?? null;

    return {
      x: name === null ? "No value" : formatChartValue(props.x, name),
      s0: value === undefined ? null : (row[value.key] ?? null),
      fill: slot(index),
    };
  });

  return (
    <ChartContainer fill={props.slide === true}>
      <PieChart title={props.title}>
        <Pie
          data={data}
          dataKey="s0"
          nameKey="x"
          innerRadius="60%"
          isAnimationActive={false}
        />
        <ChartTooltip
          content={({ active, payload }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={undefined}
              formatLabel={() => ""}
              formatValue={(item) =>
                value === undefined || item.value === undefined
                  ? ""
                  : formatChartValue(value, Number(item.value))
              }
            />
          )}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  );
}

const TREND_ICON = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  flat: MinusIcon,
} as const;

function KpiValue(props: ChartProps) {
  const column = props.columns[0];
  const row = props.rows[0];
  const value = column === undefined ? null : (row?.[column.key] ?? null);

  // Neutral, not good or bad: whether a rise is good depends on the figure.
  const change =
    props.change === undefined || props.slide === true
      ? null
      : kpiChange(value === null ? null : Number(value), props.change);

  const Trend = change === null ? null : TREND_ICON[change.direction];

  const figure = (
    <p
      className={
        props.slide === true
          ? "text-3xl font-bold tabular-nums whitespace-nowrap"
          : "text-2xl font-bold tabular-nums"
      }
    >
      {column === undefined || row === undefined
        ? ""
        : formatChartValue(column, row[column.key] ?? null)}
    </p>
  );

  return change === null || Trend === null ? (
    figure
  ) : (
    <div className="grid gap-1">
      {figure}
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Trend aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        {change.text}
      </p>
    </div>
  );
}

/**
 * The one chart (Spec 7 R-16). It draws the `ChartData` that the core chart gate answers, with a
 * Chart and a Table view, fixed series colors, and a caption that names the dataset and the read
 * time. No figure to draw shows the compact empty state, never an empty plot.
 */
export function Chart(props: ChartProps) {
  const titleId = useId();
  const slide = props.slide === true;

  const table = (
    <ChartTable
      label={props.title}
      columns={
        props.x === undefined ? props.columns : [props.x, ...props.columns]
      }
      rows={props.rows}
      recordPaths={props.recordPaths}
      linkComponent={props.linkComponent ?? PlainLink}
    />
  );

  let body = table;

  if (isChartEmpty(props)) {
    body = (
      <EmptyState title="No data" description="No records match this chart." />
    );
  } else if (props.kind === "kpi") {
    body = <KpiValue {...props} />;
  } else if (slide) {
    // The slide chose the kind, so it shows it without the Chart and Table tabs (F1).
    body =
      props.kind === "table" || props.x === undefined ? (
        <SlideTable
          label={props.title}
          columns={props.columns}
          rows={props.rows}
        />
      ) : props.kind === "donut" ? (
        <DonutPlot {...props} x={props.x} />
      ) : (
        <CartesianPlot {...props} x={props.x} />
      );
  } else if (props.x !== undefined && props.kind !== "table") {
    body = (
      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          {props.kind === "donut" ? (
            <DonutPlot {...props} x={props.x} />
          ) : (
            <CartesianPlot {...props} x={props.x} />
          )}
        </TabsContent>
        <TabsContent value="table">{table}</TabsContent>
      </Tabs>
    );
  }

  return (
    <figure
      aria-labelledby={titleId}
      className={
        slide ? "flex h-full min-w-0 flex-col gap-1" : "grid min-w-0 gap-3"
      }
    >
      <div id={titleId} className="font-semibold">
        {props.title}
      </div>
      {/* A KPI value stays right under its label (7.4); a plot takes the rest of the box. */}
      {slide && props.kind !== "kpi" ? (
        <div className="min-h-0 flex-1">{body}</div>
      ) : (
        body
      )}
      <figcaption className="text-xs text-muted-foreground">
        {chartCaption(props, props.timeZone, props.caption)}
      </figcaption>
    </figure>
  );
}
