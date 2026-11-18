"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@genie/ui";
import { type ReactElement, type ReactNode, useId } from "react";

import { addRefusal } from "./slide-rules.ts";
import type { ShownSlide } from "./views.ts";

export type HandKind = "text" | "bullets" | "image";

export type AskKind = "figure" | "chart" | "table";

/** The owner's words for a slide that takes no new element (E5, 6wz1.126). */
const SLIDE_FULL = "This slide is full. Remove an element or add a new slide.";

/** Ask cannot run in this deployment (G3). */
const AI_OFF = "AI is off.";

const ITEMS = [
  ["text", "Text"],
  ["bullets", "Bullets"],
  ["figure", "Figure"],
  ["chart", "Chart"],
  ["table", "Table"],
  ["image", "Image"],
] as const;

function isAskKind(kind: HandKind | AskKind): kind is AskKind {
  return kind === "figure" || kind === "chart" || kind === "table";
}

/** The starter question that a Figure, Chart or Table item sends to Ask for the shown slide (P13-2). */
export function askStarter(kind: AskKind, slideNumber: number): string {
  return `Which ${kind} can I add to slide ${slideNumber}?`;
}

export type AddElementMenuProps = {
  readonly slide: ShownSlide;
  readonly saving?: boolean | undefined;
  /** The person's Ask: "on" offers Figure, Chart and Table, "off" shows them with "AI is off.", "none" leaves them out. */
  readonly ask: "on" | "off" | "none";
  readonly onAdd: (kind: HandKind) => void;
  readonly onAsk: (kind: AskKind) => void;
  /** The trigger the menu renders: the bar's secondary button, or a dock tool. */
  readonly trigger: ReactElement;
  readonly children: ReactNode;
};

/** Add element: Text, Bullets and Image add by hand; Figure, Chart and Table ask Ask (czjw.189). */
export function AddElementMenu(props: AddElementMenuProps): ReactNode {
  const kinds = props.slide.elements.map(({ kind }) => kind);

  const offered = ITEMS.flatMap(([kind, label]) => {
    if (props.ask === "none" && isAskKind(kind)) return [];

    const rule = addRefusal(kinds, kind);

    return [
      {
        kind,
        label,
        rule,
        reason:
          rule ?? (isAskKind(kind) && props.ask === "off" ? AI_OFF : undefined),
      },
    ];
  });

  const full = offered.every(({ rule }) => rule !== undefined);
  const fullId = useId();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={props.saving} render={props.trigger}>
        {props.children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-describedby={full ? fullId : undefined}
      >
        {full ? (
          <p id={fullId} className="px-1.5 py-1 text-xs text-muted-foreground">
            {SLIDE_FULL}
          </p>
        ) : null}
        {offered.map(({ kind, label, reason }) => (
          // A kind the slide rules refuse is offered with its rule, never refused after.
          <DropdownMenuItem
            key={kind}
            reason={reason}
            onClick={() =>
              isAskKind(kind) ? props.onAsk(kind) : props.onAdd(kind)
            }
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
