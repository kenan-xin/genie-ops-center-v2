"use client";

// From the shadcn base-nova `combobox`, trimmed to a search field and its list and moved onto the
// tokens `select.tsx` uses. The chips, the clear button, the trigger and the input group are left
// out until a screen needs them.
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";

import { focusRing } from "../theme/tokens.ts";
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
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
};
