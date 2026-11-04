import type { CSSProperties } from "react";

import type { Figure } from "../parts/figure-strip.tsx";

/**
 * The figure card of a list (variant C, owner note of 2026-11-03): one bordered card, cells split
 * by 1 px lines, and each figure's caption, value and sub-line on shared rows, so the values line
 * up. On a phone two columns; the lead spans both only when the count is odd (LH18).
 */
export function ListFigures(props: {
  readonly label: string;
  readonly figures: readonly Figure[];
}) {
  const odd = props.figures.length % 2 === 1;

  return (
    <section
      aria-label={props.label}
      className="overflow-hidden rounded-xl border border-border"
    >
      {/* The 1 px gap shows the border color between the cells. */}
      <dl
        className="grid grid-cols-2 gap-px bg-border md:grid-cols-(--figure-columns)"
        style={
          // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
          {
            "--figure-columns": `repeat(${props.figures.length}, minmax(0, 1fr))`,
          } as CSSProperties
        }
      >
        {props.figures.map((figure) => (
          <div
            key={figure.label}
            data-lead={figure.lead === true ? "" : undefined}
            className={
              figure.lead === true && odd
                ? "col-span-2 row-span-3 grid grid-rows-subgrid gap-y-1 bg-card px-3.5 pt-3 pb-3.5 md:col-span-1 md:px-5 md:pt-3.5 md:pb-4"
                : "row-span-3 grid grid-rows-subgrid gap-y-1 bg-card px-3.5 pt-3 pb-3.5 md:px-5 md:pt-3.5 md:pb-4"
            }
          >
            <dt className="text-xs font-semibold text-muted-foreground">
              {figure.label}
            </dt>
            <dd
              className={
                figure.lead === true
                  ? "self-baseline text-lg font-bold tracking-tight whitespace-nowrap tabular-nums md:text-2xl"
                  : "self-baseline text-base font-semibold whitespace-nowrap tabular-nums md:text-lg"
              }
            >
              {figure.value}
            </dd>
            <dd className="text-xs text-muted-foreground tabular-nums">
              {figure.note ?? ""}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
