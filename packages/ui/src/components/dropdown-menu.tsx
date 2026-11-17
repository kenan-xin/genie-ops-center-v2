"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { ChevronRightIcon, CheckIcon } from "lucide-react";
import * as React from "react";

import { denseRowHeight, rowHeight } from "../theme/tokens.ts";

/**
 * Base UI focuses the item under the pointer, and Chrome then reports `:focus-visible`. The popup
 * marks pointer use with `data-pointer` (cleared by a key), and the ring shows only without it, so
 * it is a keyboard cue. In dark the card is the muted color, so the fill steps up to the border.
 */
const menuRowFocus =
  "outline-none focus:bg-muted focus:text-foreground dark:focus:bg-border [&:not([data-pointer]_*)]:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * 6wz1.113 (P07-72): `iconLead` on a row's leading icon, so its ink starts on the label's text edge.
 * An icon that names its own `iconLeadPx` offset keeps it.
 */
const leadingIcon =
  "[&>svg:first-child:not([class*='start-'])]:relative [&>svg:first-child:not([class*='start-'])]:-start-px";

/**
 * The check of a checkbox or radio row (P07-54, P07-73): one line tall at the top of the row's
 * content, so it centers on the first line when a label wraps or carries a second line.
 */
function ItemIndicator(props: {
  readonly slot: string;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className="pointer-events-none flex h-lh w-4 shrink-0 items-center justify-center"
      data-slot={props.slot}
    >
      {props.children}
    </span>
  );
}

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  onPointerMove,
  onKeyDown,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            // A popup that holds `lg` rows starts every label and row on their 12 px edge, so it has
            // one text edge (6wz1.113, P07-73).
            "[&:has([data-size=lg])_:is([data-slot=dropdown-menu-label],[data-slot=dropdown-menu-item],[data-slot=dropdown-menu-sub-trigger],[data-slot=dropdown-menu-checkbox-item],[data-slot=dropdown-menu-radio-item]):not([data-inset])]:ps-3",
            "z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-card p-1 text-foreground shadow-md outline-none motion-safe:transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0",
            className
          )}
          {...props}
          onPointerMove={(event) => {
            event.currentTarget.toggleAttribute("data-pointer", true);
            onPointerMove?.(event);
          }}
          onKeyDown={(event) => {
            event.currentTarget.removeAttribute("data-pointer");
            onKeyDown?.(event);
          }}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-8",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  size = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
  /** `lg`: the user menu's rows, 44 px under `lg` and 36 px from it (6wz1.114). */
  size?: "default" | "lg";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      data-size={size}
      className={cn(
        "data-[size=lg]:rounded-lg data-[size=lg]:px-3 data-[size=lg]:py-2",
        "group/dropdown-menu-item relative flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 text-sm select-none data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:text-destructive-on-dark dark:data-[variant=destructive]:focus:text-destructive-on-dark data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive dark:data-[variant=destructive]:*:[svg]:text-destructive-on-dark",
        size === "lg" ? rowHeight : denseRowHeight,
        leadingIcon,
        menuRowFocus,
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 text-sm select-none data-inset:pl-8 data-popup-open:bg-muted data-open:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        denseRowHeight,
        leadingIcon,
        menuRowFocus,
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center rounded-md py-1 pr-2 pl-1.5 text-sm select-none data-inset:pl-8 data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        denseRowHeight,
        menuRowFocus,
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {children}
        </span>
        <ItemIndicator slot="dropdown-menu-checkbox-item-indicator">
          <MenuPrimitive.CheckboxItemIndicator>
            <CheckIcon />
          </MenuPrimitive.CheckboxItemIndicator>
        </ItemIndicator>
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center rounded-md py-1 pr-2 pl-1.5 text-sm select-none data-inset:pl-8 data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        denseRowHeight,
        menuRowFocus,
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {children}
        </span>
        <ItemIndicator slot="dropdown-menu-radio-item-indicator">
          <MenuPrimitive.RadioItemIndicator>
            <CheckIcon />
          </MenuPrimitive.RadioItemIndicator>
        </ItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
