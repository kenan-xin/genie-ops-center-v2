import type { ReactNode } from "react";

export type Figure = {
  readonly label: string;
  /** Formatted already, for example `SGD 5,200.00`. */
  readonly value: string;
  /** The one figure in large type; it spans both columns on a phone. */
  readonly lead?: true;
  /** A status pill beside the value. */
  readonly status?: ReactNode;
  /** A short line under the value, for example a due date. */
  readonly note?: string;
};

/**
 * The header strip of figures under a page header: no card, a hairline below. The value is the
 * first `dd` after its label, so a reader of label then value never reads the pill.
 */
export function FigureStrip(props: {
  readonly label: string;
  readonly figures: readonly Figure[];
}) {
  return (
    <section
      aria-label={props.label}
      className="border-b border-border pb-4 md:pb-5"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 md:flex md:flex-wrap md:items-end md:gap-x-12 md:gap-y-4">
        {props.figures.map((figure) => (
          <div
            key={figure.label}
            className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 ${figure.lead ? "col-span-2" : ""}`}
          >
            <dt className="basis-full text-xs font-semibold text-muted-foreground">
              {figure.label}
            </dt>
            <dd
              className={`min-w-0 tabular-nums ${
                figure.lead
                  ? "text-2xl leading-tight font-bold tracking-tight"
                  : "text-lg leading-snug font-semibold"
              }`}
            >
              {figure.value}
            </dd>
            {figure.status === undefined ? null : <dd>{figure.status}</dd>}
            {figure.note === undefined ? null : (
              <dd className="basis-full text-xs text-muted-foreground">
                {figure.note}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
