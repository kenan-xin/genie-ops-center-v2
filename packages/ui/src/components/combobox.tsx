"use client";

// From the shadcn base-nova `combobox`, trimmed to a search field and its list and moved onto the
// tokens `select.tsx` uses. The chips, the clear button and the input group are left out until a
// screen needs them.
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";

import { fieldHeight, focusRing } from "../theme/tokens.ts";
import { Input } from "./input.tsx";

const Combobox = ComboboxPrimitive.Root;

/** The search field: the shared Input, as the list searches beside it show it. */
function ComboboxInput(props: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      render={<Input />}
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
        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm whitespace-nowrap motion-safe:transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50",
        fieldHeight,
        variant === "filter-set"
          ? "border-primary/40 bg-primary/8 font-semibold text-primary dark:text-brand-on-dark"
          : variant === "filter"
            ? "border-control bg-card text-foreground hover:bg-muted"
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
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
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
        "relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground select-none data-highlighted:bg-border data-disabled:pointer-events-none data-disabled:opacity-50 lg:min-h-10",
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

export {
  Combobox,
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
