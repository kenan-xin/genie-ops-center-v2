"use client";

import { cn } from "cn";
import type { ComponentProps } from "react";
import * as RechartsPrimitive from "recharts";

// Adapted from @shadcn/chart (base-nova, shadcn 4.22.1) to the house rules. Every mark takes its
// fixed series color (`var(--chart-N)`) directly, so the per-chart `<style>` element, its `.dark`
// selector and the config lookup are gone: this product sets `data-theme`, and the variables
// switch with it. The legend and the tooltip read the name and the color that Recharts passes, and
// draw the swatch as SVG, so no inline style holds a color. The tooltip formats through its caller,
// because the shadcn default prints raw numbers.

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

function ChartContainer({
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly children: ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  return (
    <div
      data-slot="chart"
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
        className
      )}
      {...props}
    >
      <RechartsPrimitive.ResponsiveContainer
        initialDimension={INITIAL_DIMENSION}
      >
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

function ChartSwatch({ color }: { readonly color: string | undefined }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5 shrink-0">
      <rect width="10" height="10" rx="2" fill={color} />
    </svg>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
  className,
}: {
  readonly active: boolean;
  readonly payload: RechartsPrimitive.TooltipPayload;
  readonly label: string | number | undefined;
  readonly formatLabel: (label: string | number | undefined) => string;
  readonly formatValue: (item: RechartsPrimitive.TooltipPayloadEntry) => string;
  readonly className?: string;
}) {
  if (!active || payload.length === 0) {
    return null;
  }

  const heading = formatLabel(label);

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {heading === "" ? null : <div className="font-medium">{heading}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, index) => (
          <div key={index} className="flex w-full items-center gap-2">
            <ChartSwatch color={item.color ?? item.fill} />
            <div className="flex flex-1 items-center justify-between gap-4 leading-none">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatValue(item)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  payload = [],
  verticalAlign = "bottom",
}: {
  readonly className?: string;
  readonly payload?: readonly RechartsPrimitive.LegendPayload[];
  readonly verticalAlign?: "top" | "middle" | "bottom";
}) {
  if (payload.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item, index) => (
        <li key={index} className="flex items-center gap-1.5">
          <ChartSwatch color={item.color} />
          {item.value}
        </li>
      ))}
    </ul>
  );
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
};
