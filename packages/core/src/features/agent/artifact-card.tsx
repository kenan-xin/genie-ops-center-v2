"use client";

import { focusRing } from "@genie/ui";
import { ChartColumnIcon, TableIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ArtifactRef, CardArtifact } from "./artifact-refs.ts";

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

const cardClass = `flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-start ${focusRing}`;

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
}): ReactNode {
  const { artifact } = props;

  return (
    <>
      <KindIcon kind={artifact.kind} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{artifact.title}</span>
        <span className="text-xs text-muted-foreground">
          {artifact.kind === "table" ? "Table" : "Chart"} · v{artifact.version}
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

  if (action.kind === "link") {
    return (
      <a href={action.href(ref)} className={`${cardClass} hover:bg-muted`}>
        <Body artifact={artifact} end="Open in Ask" />
      </a>
    );
  }

  const shown =
    action.shown?.artifactId === ref.artifactId &&
    action.shown.version === ref.version;

  return (
    <button
      type="button"
      aria-pressed={shown}
      className={`${cardClass} hover:bg-muted aria-pressed:border-primary`}
      onClick={() => action.onOpen(ref)}
    >
      <Body artifact={artifact} end={shown ? "Showing" : "Open"} />
    </button>
  );
}
