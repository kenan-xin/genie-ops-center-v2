"use client";

import { focusRing, Skeleton } from "@genie/ui";
import { ChartColumnIcon, TableIcon } from "lucide-react";
import type { ReactNode } from "react";

import { rowsText } from "./answer-sources.ts";
import type { ArtifactRef, CardArtifact } from "./artifact-refs.ts";
import { useGatedChart } from "./gated-chart.tsx";
import {
  amountNote,
  moreText,
  SHORT_LIST_ROWS,
  ShortListRows,
} from "./short-list.tsx";

/**
 * What a card does (AG12): in Ask it opens the artifact panel beside the chat and marks the shown
 * version; in the agent panel it links to the artifact in Ask.
 */
export type ArtifactCardAction =
  | {
      readonly kind: "panel";
      readonly shown: ArtifactRef | null;
      readonly onOpen: (ref: ArtifactRef) => void;
    }
  | { readonly kind: "link"; readonly href: (ref: ArtifactRef) => string };

const frameClass = "rounded-lg border border-border bg-card";

const controlClass = `flex min-h-14 w-full items-center gap-3 rounded-lg px-4 py-3.5 text-start ${focusRing}`;

const cardClass = `${frameClass} ${controlClass}`;

// A table card's header sits on a hairline over its rows (czjw.118 items 1 and 2).
const headerClass = `${controlClass} rounded-b-none border-b border-border`;

const moreClass = `inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline lg:min-h-8 ${focusRing}`;

type PreviewOpen =
  | { readonly kind: "button"; readonly onOpen: () => void }
  | { readonly kind: "link"; readonly href: string };

/**
 * The first rows of a table card, then a footer with how many more and which amounts the rows show
 * (R-44a, FL1, czjw.118). It reads the gate as the viewer
 * with the panel's query key, so opening the panel reads nothing twice. A refused read shows no
 * preview, and the card still opens the panel, which shows the refusal.
 */
export function TablePreview(props: {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the model's raw panel config; the gate is its parser
  readonly config: unknown;
  readonly open: PreviewOpen;
}): ReactNode {
  const { config, query } = useGatedChart(props.config);

  if (config === undefined || query.isError) return null;

  if (query.isPending) {
    return (
      <div aria-hidden="true" className="grid gap-1.5 px-4 py-2.5">
        <div className="grid h-4">
          <Skeleton className="w-full" />
        </div>
        <div className="grid h-4">
          <Skeleton className="w-2/3" />
        </div>
      </div>
    );
  }

  const { data } = query.data;

  const hidden = data.rows.length - SHORT_LIST_ROWS;

  const label = moreText(hidden, data.truncated);

  // The name starts with the visible text, so a person who speaks what they see reaches it.
  const name = `${label}, open the full list`;

  const more =
    hidden <= 0 ? null : props.open.kind === "link" ? (
      <a href={props.open.href} aria-label={name} className={moreClass}>
        {label}
      </a>
    ) : (
      <button
        type="button"
        aria-label={name}
        className={moreClass}
        onClick={props.open.onOpen}
      >
        {label}
      </button>
    );

  const note = amountNote(
    data.x === undefined ? data.columns : [data.x, ...data.columns]
  );

  return (
    <>
      <div className="min-w-0 px-4 py-2.5">
        <ShortListRows data={data} />
      </div>
      {more === null && note === undefined ? null : (
        <div className="flex items-center gap-3 border-t border-border px-4 pt-2.5 pb-3">
          {more}
          {note === undefined ? null : (
            <span className="ms-auto text-xs text-muted-foreground">
              {note}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function KindIcon(props: { readonly kind: CardArtifact["kind"] }): ReactNode {
  const Icon = props.kind === "table" ? TableIcon : ChartColumnIcon;

  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

function Body(props: {
  readonly artifact: CardArtifact;
  readonly end: string;
  /** A table's row count once its preview's read answers, for example "37 rows". */
  readonly rows?: string | undefined;
}): ReactNode {
  const { artifact } = props;

  return (
    <>
      <KindIcon kind={artifact.kind} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">{artifact.title}</span>
        <span className="text-xs text-muted-foreground">
          {artifact.kind === "table" ? "Table" : "Chart"} · v{artifact.version}
          {props.rows === undefined ? null : ` · ${props.rows}`}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {props.end}
      </span>
    </>
  );
}

/**
 * One artifact an answer made (R-45a): its kind, title and version, and where it opens. Its visible
 * text is its name, so a person who speaks what they see reaches it (WCAG 2.5.3).
 */
export function ArtifactCard(props: {
  readonly artifact: CardArtifact;
  readonly action: ArtifactCardAction;
  /** False while its answer streams: the version is stored only when the answer ends (AG24). */
  readonly ready: boolean;
}): ReactNode {
  const { artifact, action } = props;

  const ref = { artifactId: artifact.artifactId, version: artifact.version };

  const table = artifact.kind === "table";

  // The preview's query key, so the header's row count and the rows share one gate call.
  const { query } = useGatedChart(
    table ? artifact.config : undefined,
    props.ready && table
  );

  const rows =
    query.data === undefined
      ? undefined
      : rowsText(query.data.data.rows.length, query.data.data.truncated);

  if (!props.ready) {
    return (
      <button
        type="button"
        disabled
        className={`${cardClass} cursor-not-allowed opacity-70`}
      >
        <Body artifact={artifact} end="Ready when the answer ends" />
      </button>
    );
  }

  // A table card's frame holds the control and the preview, so no control sits inside another.
  const ownFrame = table ? headerClass : cardClass;

  let control: ReactNode;

  let open: PreviewOpen;

  if (action.kind === "link") {
    const href = action.href(ref);

    open = { kind: "link", href };

    control = (
      <a href={href} className={`${ownFrame} hover:bg-muted`}>
        <Body artifact={artifact} end="Open in Ask" rows={rows} />
      </a>
    );
  } else {
    const shown =
      action.shown?.artifactId === ref.artifactId &&
      action.shown.version === ref.version;

    open = { kind: "button", onOpen: () => action.onOpen(ref) };

    control = (
      <button
        type="button"
        aria-pressed={shown}
        className={`${ownFrame} hover:bg-muted aria-pressed:border-primary`}
        onClick={() => action.onOpen(ref)}
      >
        <Body
          artifact={artifact}
          end={shown ? "Showing" : "Open"}
          rows={rows}
        />
      </button>
    );
  }

  if (!table) return control;

  return (
    <div
      className={`${frameClass} grid has-[[aria-pressed=true]]:border-primary`}
    >
      {control}
      <TablePreview config={artifact.config} open={open} />
    </div>
  );
}
