"use client";

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

  return (
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
                <dd className="tabular-nums">{column.cell(row)}</dd>
              </div>
            ))}
          </dl>
        ),
      }}
    />
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

  const marks = columns.map((column, index) => {
    const shared = {
      key: seriesKey(index),
      dataKey: seriesKey(index),
      name: column.label,
      // The motion tokens allow 150 to 220 ms, and a chart that animates longer reads as slow.
      isAnimationActive: false,
    };

    if (props.kind === "bar") {
      return <Bar {...shared} fill={slot(index)} radius={4} />;
    }

    return props.kind === "line" ? (
      <Line
        {...shared}
        type="monotone"
        stroke={slot(index)}
        strokeWidth={2}
        dot={{ fill: slot(index) }}
      />
    ) : (
      <Area
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
    <ChartContainer>
      <Plot data={data} title={props.title} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string | number | null) =>
            value === null ? "No value" : formatChartValue(x, value)
          }
        />
        <YAxis
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
        {columns.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
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
    <ChartContainer>
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

function KpiValue(props: ChartProps) {
  const column = props.columns[0];
  const row = props.rows[0];

  return (
    <p className="text-2xl font-bold tabular-nums">
      {column === undefined || row === undefined
        ? ""
        : formatChartValue(column, row[column.key] ?? null)}
    </p>
  );
}

/**
 * The one chart (Spec 7 R-16). It draws the `ChartData` that the core chart gate answers, with a
 * Chart and a Table view, fixed series colors, and a caption that names the dataset and the read
 * time. No figure to draw shows the compact empty state, never an empty plot.
 */
export function Chart(props: ChartProps) {
  const titleId = useId();

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
    <figure aria-labelledby={titleId} className="grid min-w-0 gap-3">
      <div id={titleId} className="font-semibold">
        {props.title}
      </div>
      {body}
      <figcaption className="text-xs text-muted-foreground">
        {chartCaption(props, props.timeZone)}
      </figcaption>
    </figure>
  );
}
