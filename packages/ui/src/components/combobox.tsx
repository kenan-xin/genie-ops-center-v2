"use client";

// From the shadcn base-nova `combobox`, moved onto the tokens `select.tsx` uses. The chips came
// with Access Add assignment (P12-14); the clear button and the input group are left out until a
// screen needs them.
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import { ChevronDownIcon, XIcon } from "lucide-react";
import type * as React from "react";

import {
  controlHeights,
  fieldText,
  focusRing,
  rowHeight,
  touchAreas,
} from "../theme/tokens.ts";
import { Input } from "./input.tsx";

const Combobox = ComboboxPrimitive.Root;

/** The search field: the shared Input, as the list searches beside it show it. */
function ComboboxInput({
  size = "md",
  ...props
}: Omit<ComboboxPrimitive.Input.Props, "size"> & {
  /** The field's height: the md field, or the dense one of a review form (czjw.186). */
  readonly size?: "md" | "dense";
}) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      render={<Input size={size} />}
      {...props}
    />
  );
}

/**
 * The button that opens the list, for the search-inside-the-popup form. It takes the shape of the
 * md `SelectTrigger`, the field height, and its text is the current choice or the prompt.
 */
function ComboboxTrigger({
  className,
  children,
  variant = "default",
  ...props
}: ComboboxPrimitive.Trigger.Props & {
  /**
   * `filter` is an empty list filter in the bar, with the control border (czjw.102); `filter-set`
   * tints a list filter that holds a value: tinted and semibold (R-37a, czjw.65).
   */
  readonly variant?: "default" | "filter" | "filter-set";
}) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 whitespace-nowrap motion-safe:transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50",
        controlHeights.md,
        fieldText,
        touchAreas.md,
        variant === "filter-set"
          ? "border-primary/40 bg-primary/8 font-semibold text-primary dark:text-brand-on-dark"
          : variant === "filter"
            ? "border-control bg-card text-foreground hover:bg-hover"
            : "border-input bg-card text-foreground",
        focusRing,
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none size-4 shrink-0 text-muted-foreground"
      />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-md border border-border bg-card text-foreground shadow-md motion-safe:transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        // The same 44 px row and --border highlight as SelectItem (DR-02).
        "relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground select-none data-highlighted:bg-border data-disabled:pointer-events-none data-disabled:opacity-50",
        rowHeight,
        focusRing,
        className
      )}
      {...props}
    />
  );
}

/** A section of the list. Its `items` feed the `ComboboxCollection` inside it. */
function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn("py-1 first:pt-0 last:pb-0", className)}
      {...props}
    />
  );
}

/** The caption of a section, which names the group to assistive technology. */
function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn(
        "px-2 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  );
}

/** The filtered items of the enclosing `ComboboxGroup`. */
function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-2 text-sm text-muted-foreground empty:hidden",
        className
      )}
      {...props}
    />
  );
}

/** The field of a several-pick combobox: the chips, then the input. It grows a line per row of chips. */
function ComboboxChips({
  className,
  ...props
}: ComboboxPrimitive.Chips.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex w-full flex-wrap items-center gap-2 rounded-lg border border-input bg-card px-1.5 py-0.5 text-foreground motion-safe:transition-colors focus-within:border-primary has-aria-invalid:border-destructive",
        // A field box (6wz1.114): the md control height as its least height, so it grows as chips
        // wrap, and a 44 px touch area under lg. Base UI focuses the input on a press in the box.
        // `gap-2`: a chip's remove button reaches 10 px past its 24 px box; the 2 px chip edge and the
        // 8 px gap keep that area off the input, beside and under the chip (C12-7).
        controlHeights.md,
        "h-auto lg:h-auto",
        touchAreas.md,
        className
      )}
      {...props}
    />
  );
}

/** One pick. Backspace or Delete removes a focused chip; the remove button is named by `removeLabel`. */
function ComboboxChip({
  className,
  children,
  removeLabel,
  ...props
}: ComboboxPrimitive.Chip.Props & { readonly removeLabel: string }) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        // The prototype's 28 px tag (access-start .tag): a tag, not a control; its remove button carries the touch area.
        "flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-tile ps-2 pe-0.5 text-sm font-semibold whitespace-nowrap text-foreground",
        focusRing,
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        aria-label={removeLabel}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-hover",
          touchAreas.sm
        )}
      >
        <XIcon aria-hidden="true" className="pointer-events-none size-3.5" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  );
}

/** The text input after the chips. */
function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chips-input"
      className={cn(
        "min-w-30 flex-1 bg-transparent px-1 text-foreground outline-none placeholder:text-placeholder",
        fieldText,
        className
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
};
