"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@genie/ui";
import type { ReactNode } from "react";

import { SlideEditor, type SlideEditorProps } from "./slide-editor.tsx";
import { useIsPhone } from "./use-is-phone.ts";
import type { ShownSlide } from "./views.ts";

export type EditSlideSheetProps = Omit<SlideEditorProps, "slide"> & {
  /** The slide and its number as the sheet opened them (R-53); null closes the sheet. */
  readonly target: {
    readonly slide: ShownSlide;
    readonly number: number;
  } | null;
  readonly count: number;
  readonly deckTitle: string;
  /** The editor's refusal, such as the deck-changed line with Reload; null shows none. */
  readonly failure: ReactNode;
  /** Runs after the sheet has closed and returned focus, so a panel it opens keeps the focus. */
  readonly onClosed?: (() => void) | undefined;
};

/** The Edit slide sheet: the right sheet from 768 px, a bottom sheet below it. */
export function EditSlideSheet(props: EditSlideSheetProps): ReactNode {
  const { target, count, deckTitle, failure, onClosed, ...editor } = props;
  const phone = useIsPhone();

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onClosed?.();
      }}
    >
      <SheetContent
        side={phone ? "bottom" : "right"}
        className="data-[side=bottom]:top-6 data-[side=right]:md:w-110"
      >
        {/* SheetContent owns its gap; the frame's parts touch, so they sit in one plain column. */}
        <div className="flex min-h-0 flex-1 flex-col">
          {phone ? (
            <div
              data-sheet-grab=""
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-control"
            />
          ) : null}
          <div className="border-b border-border">
            <SheetHeader>
              <SheetTitle>Edit slide {target?.number}</SheetTitle>
              <SheetDescription>
                Slide {target?.number} of {count} · {deckTitle}
              </SheetDescription>
            </SheetHeader>
          </div>
          {failure === null ? null : <div className="px-5 pt-4">{failure}</div>}
          {target === null ? null : (
            <SlideEditor
              key={target.slide.id}
              slide={target.slide}
              {...editor}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
