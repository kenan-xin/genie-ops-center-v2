"use client";

import { Button, focusRing } from "@genie/ui";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ChatLabels } from "../../services/agent/index.ts";
import {
  durationLabel,
  elapsedLabel,
  isSlow,
  type MessagePart,
  rowText,
  shownRows,
  stepTimeline,
  type TimelineRow,
  toolNameOf,
} from "./step-model.ts";

/**
 * An answer's steps as a vertical timeline (czjw.81, prototype variant B): "Thinking" before the
 * first step, the active step with its time and the slow line, older steps folded behind "+n
 * earlier steps", and, once the answer ended, one strip "Used 5 steps · 38s" that opens the list.
 * A final refusal shows a box under the answer with Try again. Under reduced motion every node
 * stands still and the words carry the state.
 */

const stepLinkClass = `inline-flex min-h-8 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-brand-on-dark ${focusRing}`;

function steps(n: number): string {
  return `${n} ${n === 1 ? "step" : "steps"}`;
}

function Node(props: { readonly state: TimelineRow["state"] }): ReactNode {
  if (props.state === "done") {
    return (
      <span className="grid size-4 place-items-center rounded-full border border-foreground bg-card text-foreground">
        <CheckIcon aria-hidden="true" className="size-2.5" strokeWidth={3} />
      </span>
    );
  }

  if (props.state === "failed") {
    return (
      <span className="grid size-4 place-items-center rounded-full border border-destructive bg-card text-destructive">
        <XIcon aria-hidden="true" className="size-2.5" strokeWidth={3} />
      </span>
    );
  }

  return (
    <span className="grid size-4 place-items-center rounded-full border border-primary bg-card">
      <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
    </span>
  );
}

/** The queries behind a read, on demand (agent-native rule 3, AG18). */
function Details(props: { readonly parts: readonly MessagePart[] }): ReactNode {
  const queries = props.parts.flatMap((part) =>
    toolNameOf(part) === "query-dataset" &&
    "input" in part &&
    part.input !== undefined
      ? [part.input]
      : []
  );

  if (queries.length === 0) return null;

  return (
    <details className="group/details text-sm">
      <summary className={`${stepLinkClass} cursor-pointer list-none`}>
        Details
      </summary>
      <div className="mt-1 grid gap-1">
        <p className="text-xs font-semibold text-muted-foreground">
          Query used
        </p>
        {queries.map((query, index) => (
          <pre
            key={index}
            className="overflow-x-auto rounded-md bg-muted p-2 text-xs"
          >
            {JSON.stringify(query, null, 2)}
          </pre>
        ))}
      </div>
    </details>
  );
}

function Row(props: {
  readonly row: TimelineRow;
  readonly meta?: string | undefined;
  readonly slow?: boolean;
}): ReactNode {
  const { row } = props;

  const active = row.state === "active";

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute start-2 top-5 bottom-0 -ms-px w-px bg-border group-last/rows:hidden"
      />
      <span className="shrink-0 pt-0.5">
        <Node state={row.state} />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={
              active
                ? "text-sm font-semibold text-foreground"
                : row.state === "failed"
                  ? "text-sm text-destructive dark:text-destructive-on-dark"
                  : "text-sm text-foreground"
            }
          >
            {row.words}
            {row.object === undefined ? null : (
              <>
                {" "}
                <b className="font-semibold">{row.object}</b>
              </>
            )}
            {row.fix}
          </span>
          {row.count > 1 ? (
            <span className="rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
              <span aria-hidden="true">×{row.count}</span>
              <span className="sr-only">{row.count} times</span>
            </span>
          ) : null}
          {props.meta === undefined ? null : (
            <span className="ms-auto text-xs text-muted-foreground">
              {props.meta}
            </span>
          )}
        </div>
        {props.slow === true ? (
          <p className="text-sm text-muted-foreground">
            This step is taking a while. You can stop at any time.
          </p>
        ) : null}
        <Details parts={row.parts} />
      </div>
    </li>
  );
}

function Rows(props: { readonly children: ReactNode }): ReactNode {
  return (
    <ol aria-label="Steps" className="group/rows grid">
      {props.children}
    </ol>
  );
}

/** The ms since the client first saw each active row; ticks once a second while one runs. */
function useElapsed(rows: readonly TimelineRow[]): (key: string) => number {
  const seen = useRef(new Map<string, number>());

  const [now, setNow] = useState(() => Date.now());

  const running = rows.some((row) => row.state === "active");

  for (const row of rows) {
    if (row.state === "active" && !seen.current.has(row.key)) {
      seen.current.set(row.key, now);
    }
  }

  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [running]);

  return (key) => now - (seen.current.get(key) ?? now);
}

export function StepTimeline(props: {
  readonly parts: readonly MessagePart[];
  readonly labels: ChatLabels;
  readonly streaming: boolean;
  /** A finished answer's time: the live run, or the stored gap after its question. */
  readonly durationMs?: number | undefined;
  /** Sends the question again after a final refusal (AG17); undefined hides Try again. */
  readonly onTryAgain?: (() => void) | undefined;
  /** The answer, drawn between the steps and the failure box. */
  readonly children?: ReactNode;
}): ReactNode {
  const timeline = stepTimeline(props.parts, props.labels, props.streaming);

  const [open, setOpen] = useState(false);

  const [earlier, setEarlier] = useState(false);

  const elapsed = useElapsed(timeline.rows);

  const { rows, failed } = timeline;

  let stepsView: ReactNode = null;

  if (timeline.thinking) {
    stepsView = (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Node state="active" />
        Thinking
      </div>
    );
  } else if (props.streaming && rows.length > 0) {
    // A running row always shows, also when a later read made an earlier row run again.
    const { shown, hidden } = shownRows(rows, earlier);

    stepsView = (
      <div className="grid gap-1">
        {hidden === 0 ? null : (
          <button
            type="button"
            className={`${stepLinkClass} justify-self-start ps-7`}
            onClick={() => setEarlier(true)}
          >
            +{hidden} earlier {hidden === 1 ? "step" : "steps"}
          </button>
        )}
        <Rows>
          {shown.map((row) => {
            if (row.state !== "active") return <Row key={row.key} row={row} />;

            const ms = elapsed(row.key);

            const time = elapsedLabel(ms);

            const step = `Step ${rows.indexOf(row) + 1}`;

            return (
              <Row
                key={row.key}
                row={row}
                meta={time === null ? step : `${step} · ${time}`}
                slow={isSlow(ms)}
              />
            );
          })}
        </Rows>
      </div>
    );
  } else if (rows.length > 0) {
    const time =
      props.durationMs === undefined
        ? ""
        : ` · ${durationLabel(props.durationMs)}`;

    stepsView = (
      <div className="grid gap-2">
        <button
          type="button"
          aria-expanded={open}
          className={`flex min-h-8 items-center gap-2 justify-self-start rounded-md text-sm ${failed === null ? "text-muted-foreground hover:text-foreground" : "text-destructive dark:text-destructive-on-dark"} ${focusRing}`}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true" className="flex items-center gap-1">
            {rows.map((row) => (
              <span
                key={row.key}
                className={`size-1.5 rounded-full ${row.state === "failed" ? "bg-destructive" : "bg-muted-foreground"}`}
              />
            ))}
          </span>
          {failed === null
            ? `Used ${steps(rows.length)}${time}`
            : `${rowText(failed)} · ${steps(rows.length)}${time}`}
          <ChevronRightIcon
            aria-hidden="true"
            className={`size-4 motion-safe:transition-transform ${open ? "rotate-90" : ""}`}
            strokeWidth={1.75}
          />
        </button>
        {open ? (
          <Rows>
            {rows.map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </Rows>
        ) : null}
      </div>
    );
  }

  const refusals = failed === null ? 0 : failed.fixes + 1;

  return (
    <div className="grid gap-3">
      {stepsView}
      {props.children}
      {failed === null ? null : (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-card p-3">
          <CircleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive dark:text-destructive-on-dark"
            strokeWidth={1.75}
          />
          <div className="grid flex-1 gap-1">
            <p className="text-sm font-semibold text-destructive dark:text-destructive-on-dark">
              {rowText(failed)}
            </p>
            <p className="text-sm">
              It was refused {refusals} {refusals === 1 ? "time" : "times"}, so
              nothing changed.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {props.onTryAgain === undefined ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={props.onTryAgain}
                >
                  <RotateCwIcon aria-hidden="true" strokeWidth={1.75} />
                  Try again
                </Button>
              )}
              <button
                type="button"
                className={stepLinkClass}
                onClick={() => setOpen(true)}
              >
                See the steps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
