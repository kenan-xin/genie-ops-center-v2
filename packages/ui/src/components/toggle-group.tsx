"use client";

// From the shadcn base-nova `toggle-group`, trimmed to one chip style on the Base UI primitive
// (`@base-ui/react/toggle-group`). The variant and size context and the joined (spacing 0) layout
// are left out until a screen needs them.
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "cn";

import { focusRing } from "../theme/tokens.ts";

function ToggleGroup<Value extends string>({
  className,
  ...props
}: ToggleGroupPrimitive.Props<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/** One chip: a 32 px pill with a 44 px hit area, filled while pressed (tokens.md, "Buttons"). */
function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-input bg-card px-3 text-sm font-medium whitespace-nowrap text-foreground select-none after:absolute after:-inset-1.5 motion-safe:transition-colors not-data-pressed:hover:bg-muted data-pressed:border-transparent data-pressed:bg-primary data-pressed:text-primary-foreground disabled:pointer-events-none disabled:opacity-50",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
