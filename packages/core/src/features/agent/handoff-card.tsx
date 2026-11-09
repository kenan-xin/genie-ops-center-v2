"use client";

import { buttonVariants, focusRing, IconTile } from "@genie/ui";
import { formatChartValue } from "@genie/ui/chart-data";
import { ChevronRightIcon, ForwardIcon } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";

import type { HandoffCardData } from "../../services/agent/hand-over.ts";
import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { useSessionDetail } from "./session-detail.ts";

/** The parts of a `data-brief` part that the fold shows, checked where the chat reads it. */
const briefSchema = z.object({
  goal: z.string(),
  facts: z.array(z.object({ text: z.string(), asOf: z.string() })),
  datasets: z.array(z.string()),
  notPassed: z.array(z.string()),
});

type FoldBrief = z.infer<typeof briefSchema>;

/** The brief of the target session's first message. */
export function briefOf(
  messages: readonly AgentMessage[]
): FoldBrief | undefined {
  const part = messages[0]?.parts.find(({ type }) => type === "data-brief");

  const parsed = briefSchema.safeParse(
    part !== undefined && "data" in part ? part.data : undefined
  );

  return parsed.success ? parsed.data : undefined;
}

const day = (iso: string) =>
  formatChartValue({ key: "day", label: "Day", type: "date" }, iso);

function statusText(
  agentName: string,
  read: "loading" | "deleted" | AgentRunStatus | null
): string {
  switch (read) {
    case "building":
      return `${agentName} is working`;
    case "stopping":
      return "Stopping";
    case "saved":
      return "Done";
    case "stopped":
      return "Stopped";
    case "interrupted":
      return "A restart interrupted it";
    case "failed":
      return "It could not finish";
    case "deleted":
      return "Its chat was deleted";
    default:
      return `Handing over to the ${agentName}`;
  }
}

/** What Ask passed, as a fold under the card (R-42b: the person sees the brief). */
function BriefFold(props: {
  readonly agentName: string;
  readonly brief: FoldBrief;
  readonly labels: ChatLabels;
}): ReactNode {
  const { brief } = props;

  const asOf = brief.facts[0]?.asOf;

  const data = [
    brief.datasets
      .map((name) => props.labels.datasets[name] ?? name)
      .join(", "),
    ...(asOf === undefined ? [] : [`as of ${day(asOf)}`]),
  ].join(" · ");

  const rows: readonly (readonly [string, readonly string[]])[] = [
    ["Goal", [brief.goal]],
    ["From this chat", brief.facts.map(({ text }) => text)],
    ["Data", brief.datasets.length === 0 ? [] : [data]],
    ["Not passed", [...brief.notPassed, "The rest of this chat"]],
  ];

  return (
    <details className="group border-t border-border">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-4 text-xs font-medium text-muted-foreground hover:text-foreground lg:min-h-9 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <ChevronRightIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        What Ask passed to the {props.agentName}
      </summary>
      <dl className="grid gap-1.5 px-4 pb-3 ps-9 text-xs">
        {rows.map(([term, values]) =>
          values.length === 0 ? null : (
            <div key={term} className="flex gap-4">
              <dt className="w-24 shrink-0 text-muted-foreground">{term}</dt>
              <dd className="grid gap-0.5">
                {values.map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </dd>
            </div>
          )
        )}
      </dl>
    </details>
  );
}

/**
 * The card of a handoff under Ask's answer (S7-41, prototype `agent-handoff` variant A): the
 * record's title, one live status line, Open, and what Ask passed. It reads the target session each
 * second while its run builds, and keeps the title and Open after that chat was deleted.
 */
export function HandoffCard(props: {
  readonly card: HandoffCardData;
  readonly labels: ChatLabels;
}): ReactNode {
  const { card } = props;

  const { data: read } = useSessionDetail(card.sessionId);

  const run = read?.session.run ?? null;

  const status = statusText(
    card.agentName,
    read === undefined ? "loading" : read === null ? "deleted" : run
  );

  const brief =
    read === undefined || read === null ? undefined : briefOf(read.messages);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <IconTile>
          <ForwardIcon aria-hidden="true" strokeWidth={1.75} />
        </IconTile>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-semibold">{card.title}</span>
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {status}
          </span>
        </span>
        <a
          href={card.address}
          aria-label={`Open ${card.title}`}
          className={buttonVariants({
            variant: run === "saved" ? "primary" : "secondary",
            size: "sm",
          })}
        >
          Open
        </a>
      </div>
      {brief === undefined ? null : (
        <BriefFold
          agentName={card.agentName}
          brief={brief}
          labels={props.labels}
        />
      )}
    </div>
  );
}

/** The header link to work that still builds; nothing once it ended (R-42b). */
export function HandoffChip(props: {
  readonly card: HandoffCardData;
}): ReactNode {
  const { data: read } = useSessionDetail(props.card.sessionId);

  const run = read?.session.run;

  if (run !== "building" && run !== "stopping") return null;

  return (
    <a
      href={props.card.address}
      className={`inline-flex h-8 max-w-56 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted max-lg:h-11 ${focusRing}`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
      />
      <span className="truncate">{props.card.agentName} is working</span>
    </a>
  );
}
