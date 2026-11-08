import { instantParts } from "./format.ts";

/** A list cell of an instant: the day, and the time muted under it (variant A, czjw.102). */
export function InstantCell(props: {
  readonly instant: string;
  readonly timeZone: string;
}) {
  const { day, time } = instantParts(props.instant, props.timeZone);

  return (
    <span className="grid tabular-nums">
      <span className="whitespace-nowrap">{day}</span>
      <span className="text-xs text-muted-foreground">{time}</span>
    </span>
  );
}
