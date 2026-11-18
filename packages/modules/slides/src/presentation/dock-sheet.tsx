"use client";

import {
  focusRing,
  minTouchHeight,
  Sheet,
  SheetContent,
  SheetTitle,
} from "@genie/ui";
import { type ReactNode, useId } from "react";

/** The phone dock's bottom sheet of actions (deck-phone.prototype.html, slide-more and element-more). */
export function DockSheet(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The sheet's name for a screen reader, for example "Deck and slide actions". */
  readonly title: string;
  /** The visible heading, for example "Text box"; none for the deck's sheet. */
  readonly heading?: string | undefined;
  /** Read when the sheet closes: false when the chosen action moves focus itself. */
  readonly returnFocus: () => boolean;
  /** Runs once the sheet has closed, for an action that must wait for it. */
  readonly onClosed?: (() => void) | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open) props.onClosed?.();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={props.returnFocus}
      >
        {/* SheetContent owns its spacing, so the sheet's padding sits on one plain column. */}
        <div className="flex flex-col px-3 pt-2 pb-6">
          <div
            data-sheet-grab=""
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-control"
          />
          <SheetTitle className="sr-only">{props.title}</SheetTitle>
          {/* SheetTitle owns its type, so the visible heading is its own line beside the name. */}
          {props.heading === undefined ? null : (
            <div
              aria-hidden="true"
              className="px-2 pt-1 pb-1.5 text-sm font-semibold text-muted-foreground"
            >
              {props.heading}
            </div>
          )}
          {/* One parent, so the first section knows it is first and draws no hairline. */}
          <div>{props.children}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DockSheetSection(props: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="group/section">
      <div
        aria-hidden="true"
        className="mx-2 my-1.5 h-px bg-border group-first/section:hidden"
      />
      <h3 className="px-2 pt-2 pb-1.5 text-sm font-semibold text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

export function DockSheetRow(props: {
  readonly icon: ReactNode;
  readonly label: string;
  /** The small line under the label. */
  readonly detail?: string | undefined;
  /** Why the row is off; it shows in place of `detail` and describes the row. */
  readonly reason?: string | undefined;
  readonly danger?: boolean | undefined;
  /** Off for a moment, such as during a save; no reason shows. */
  readonly busy?: boolean | undefined;
  readonly onClick: () => void;
}): ReactNode {
  const noteId = useId();
  const note = props.reason ?? props.detail;
  const off = props.reason !== undefined || props.busy === true;

  return (
    <button
      type="button"
      aria-disabled={off ? true : undefined}
      aria-describedby={note === undefined ? undefined : noteId}
      onClick={off ? undefined : props.onClick}
      className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-base hover:bg-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0 ${minTouchHeight} ${focusRing} ${props.danger === true ? "text-destructive-text" : ""}`}
    >
      {/* The icon's box is one line tall, so it centers on the label's line, not on the note. */}
      <span className="flex items-start gap-3.5">
        <span className="flex h-lh items-center">{props.icon}</span>
        <span className="flex flex-col">
          {props.label}
          {note === undefined ? null : (
            // A description, not part of the row's name.
            <span
              id={noteId}
              aria-hidden="true"
              className="text-xs text-muted-foreground"
            >
              {note}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
