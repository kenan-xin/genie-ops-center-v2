"use client";

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Toolbar,
  ToolbarButton,
} from "@genie/ui";
import { PaintBucketIcon, PencilIcon, PlusIcon } from "lucide-react";
import { type ReactNode, type Ref, useRef, useState } from "react";

import type { DeckChange } from "../contract.ts";
import {
  AddElementMenu,
  type AskKind,
  type HandKind,
} from "./add-element-menu.tsx";
import { backgroundSteps, ColorPanel } from "./style-toolbar.tsx";
import type { ShownSlide } from "./views.ts";

/** The flat bar at the screen's bottom edge below 768 px (deck-phone.prototype.html): a slide's tools, or the selected element's. */
export function PhoneDock(props: {
  readonly label: string;
  /** The selected element's row above the tools: its name and Done. */
  readonly context?: ReactNode;
  /** The tools' toolbar, which the cards anchor to. */
  readonly ref?: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}): ReactNode {
  return (
    // The shell keeps the page's last row clear of a bottom bar.
    <div
      data-shell-bottom-bar=""
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-1 pt-1 pb-2 md:hidden"
    >
      {props.context}
      <Toolbar
        ref={props.ref}
        aria-label={props.label}
        className="justify-around"
      >
        {props.children}
      </Toolbar>
    </div>
  );
}

/** The slide's tools with nothing selected; Task 8 adds More. */
export function SlideDock(props: {
  readonly slide: ShownSlide;
  readonly saving: boolean;
  readonly ask: "on" | "off" | "none";
  readonly onAdd: (kind: HandKind) => void;
  readonly onAsk: (kind: AskKind) => void;
  readonly onSteps: (steps: readonly DeckChange[]) => void;
  readonly onEditSlide: () => void;
}): ReactNode {
  const { slide } = props;
  const dock = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState(false);

  return (
    <PhoneDock label="Slide tools" ref={dock}>
      <AddElementMenu
        slide={slide}
        saving={props.saving}
        ask={props.ask}
        onAdd={props.onAdd}
        onAsk={props.onAsk}
        trigger={<ToolbarButton aria-label="Add element" />}
      >
        <PlusIcon aria-hidden="true" />
        Add
      </AddElementMenu>
      <Popover open={background} onOpenChange={setBackground}>
        <PopoverTrigger disabled={props.saving} render={<ToolbarButton />}>
          <PaintBucketIcon aria-hidden="true" />
          Background
        </PopoverTrigger>
        <PopoverContent
          anchor={dock}
          side="top"
          sideOffset={8}
          className="w-(--anchor-width)"
        >
          <div className="grid gap-3 p-1.5">
            <PopoverTitle>Background</PopoverTitle>
            <ColorPanel
              value={slide.background}
              clearLabel="No background"
              helper="Every text without a fill is checked against the new color."
              onPick={(color) => {
                setBackground(false);
                props.onSteps(backgroundSteps(slide, color));
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      <ToolbarButton disabled={props.saving} onClick={props.onEditSlide}>
        <PencilIcon aria-hidden="true" />
        Edit slide
      </ToolbarButton>
    </PhoneDock>
  );
}
