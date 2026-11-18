"use client";

import { denseRowHeight, Button, focusRing, iconLead } from "@genie/ui";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  RotateCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { AgentFileState, ChatLabels } from "../../services/agent/index.ts";
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
 * earlier steps", and, once the answer ended, one strip "Worked for 38 seconds" that opens the list.
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

/** A live row's ticking time, its slow line, and whether it is the one current step of the run. */
type LiveState = {
  readonly time: string;
  readonly slow: boolean;
  readonly current: boolean;
};

const SLOW_LINE = "This step is taking a while. You can stop at any time.";

function Row(props: {
  readonly row: TimelineRow;
  readonly live?: LiveState | undefined;
}): ReactNode {
  const { row, live } = props;

  const active = row.state === "active";

  return (
    <li
      aria-current={live?.current === true ? "step" : undefined}
      className="relative flex gap-2.5 pb-3 last:pb-0"
    >
      <span
        aria-hidden="true"
        className="absolute start-2 top-4.5 bottom-0 -ms-px w-px bg-border group-last/rows:hidden"
      />
      <span className="shrink-0">
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
          {live === undefined ? null : (
            <span className="ms-auto text-xs text-muted-foreground">
              {live.time}
            </span>
          )}
        </div>
        {live?.slow === true ? (
          <p className="text-sm text-muted-foreground">{SLOW_LINE}</p>
        ) : null}
        <Details parts={row.parts} />
      </div>
    </li>
  );
}

/** The live last row while the run works between steps or before the first one (czjw.181). */
function ThinkingRow(props: { readonly live: LiveState }): ReactNode {
  return (
    <li
      aria-current={props.live.current ? "step" : undefined}
      className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground"
    >
      <Node state="active" />
      <span>Thinking</span>
      <span className="ms-auto text-xs">{props.live.time}</span>
      {props.live.slow ? <p className="w-full">{SLOW_LINE}</p> : null}
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

/** The ms since the client first saw each key; ticks once a second while any key is live. */
function useElapsed(keys: readonly string[]): (key: string) => number {
  const seen = useRef(new Map<string, number>());

  const [now, setNow] = useState(() => Date.now());

  const running = keys.length > 0;

  for (const key of keys) {
    if (!seen.current.has(key)) seen.current.set(key, now);
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
  /** The state of each file job by its `make-file` call id. */
  readonly files?: Readonly<Record<string, AgentFileState>> | undefined;
  /** The answer's text started: the steps fold and no row is live. */
  readonly answering?: boolean | undefined;
}): ReactNode {
  const timeline = stepTimeline(
    props.parts,
    props.labels,
    props.streaming,
    props.files,
    props.answering === true
  );

  const [open, setOpen] = useState(false);

  const [earlier, setEarlier] = useState(false);

  const { rows, failed } = timeline;

  // A finished answer whose file job still runs keeps that row in sight under the strip (R-44a).
  const stillRunning = rows.filter((row) => row.state === "active");

  // Each wait between steps is its own live row, so its time starts from 0 s.
  const thinkingKey = `thinking-${rows.length}`;

  const elapsed = useElapsed([
    ...stillRunning.map((row) => row.key),
    ...(timeline.thinking ? [thinkingKey] : []),
  ]);

  const liveOf = (key: string, current: boolean): LiveState => {
    const ms = elapsed(key);

    return { time: elapsedLabel(ms), slow: isSlow(ms), current };
  };

  const rowOf = (row: TimelineRow, current = false) => (
    <Row
      key={row.key}
      row={row}
      live={row.state === "active" ? liveOf(row.key, current) : undefined}
    />
  );

  let stepsView: ReactNode = null;

  const working = props.streaming && props.answering !== true;

  if (working && (rows.length > 0 || timeline.thinking)) {
    // A running row always shows, also when a later read made an earlier row run again.
    const { shown, hidden } = shownRows(rows, earlier);

    const current = timeline.thinking
      ? undefined
      : shown.findLast((row) => row.state === "active");

    stepsView = (
      <div className="grid gap-1">
        {hidden === 0 ? null : (
          <button
            type="button"
            className={`${stepLinkClass} justify-self-start ps-6.5`}
            onClick={() => setEarlier(true)}
          >
            +{hidden} earlier {hidden === 1 ? "step" : "steps"}
          </button>
        )}
        <Rows>
          {shown.map((row) => rowOf(row, row === current))}
          {timeline.thinking ? (
            <ThinkingRow live={liveOf(thinkingKey, true)} />
          ) : null}
        </Rows>
      </div>
    );
  } else if (rows.length > 0) {
    // An answer with no stored time keeps its step count.
    const worked =
      props.durationMs === undefined
        ? steps(rows.length)
        : `Worked for ${durationLabel(props.durationMs)}`;

    stepsView = (
      <div className="grid gap-2">
        {/* The tile bleeds 10 px past the sparkle, so the ink stays on the text edge (6wz1.113, C07-1). */}
        <button
          type="button"
          aria-expanded={open}
          className={`flex items-center gap-2.5 justify-self-start rounded-lg -ms-2.5 px-2.5 text-sm font-medium hover:bg-hover ${denseRowHeight} ${failed === null ? "text-muted-foreground hover:text-foreground" : "text-destructive dark:text-destructive-on-dark"} ${focusRing}`}
          onClick={() => setOpen(!open)}
        >
          <SparklesIcon
            aria-hidden="true"
            strokeWidth={1.75}
            className={`${iconLead} size-4 shrink-0 text-primary dark:text-brand-on-dark`}
          />
          <span>
            {failed === null ? worked : `${rowText(failed)} · ${worked}`}
          </span>
          <ChevronRightIcon
            aria-hidden="true"
            className={`size-4 motion-safe:transition-transform ${open ? "rotate-90" : ""}`}
            strokeWidth={1.75}
          />
        </button>
        {open ? (
          <Rows>{rows.map((row) => rowOf(row))}</Rows>
        ) : stillRunning.length > 0 ? (
          <Rows>{stillRunning.map((row) => rowOf(row))}</Rows>
        ) : null}
      </div>
    );
  }

  const refusals = failed === null ? 0 : failed.fixes + 1;

  // The answer sits one conversation gap, 16 px, below the steps (C07-11).
  return (
    <div className="grid gap-4">
      {stepsView}
      {props.children}
      {failed === null ? null : (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-card p-3">
          <CircleAlertIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive dark:text-destructive-on-dark"
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
