"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "cn";

import { focusRing } from "../theme/tokens.ts";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(
        "flex flex-col gap-2 data-[orientation=vertical]:flex-row",
        className
      )}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & {
  /**
   * `card-top` is the tab row on the top edge of a list card: 44 px tabs and an 8 px inset, so the
   * labels start on the card's 20 px edge with the 12 px tab padding (czjw.102).
   */
  readonly variant?: "default" | "card-top";
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // Tighter below sm, so four tabs with counts fit a 390 px sheet. A scrolling row would clip
        // the active underline, which sits 1 px under the trigger.
        "inline-flex w-fit items-center gap-0 border-b sm:gap-1 border-border data-[orientation=vertical]:flex-col data-[orientation=vertical]:border-b-0",
        variant === "card-top" &&
          "px-2 *:data-[slot=tabs-trigger]:h-11 *:data-[slot=tabs-trigger]:min-h-11",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-10 min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm sm:px-3 font-medium whitespace-nowrap text-muted-foreground motion-safe:transition-colors hover:text-foreground data-active:font-semibold data-active:text-foreground disabled:pointer-events-none disabled:opacity-50",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0 dark:after:bg-brand-on-dark data-active:after:opacity-100",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      // The panel takes focus from the keyboard, so it shows the one ring (R-8).
      className={cn("flex-1 text-sm", focusRing, className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
