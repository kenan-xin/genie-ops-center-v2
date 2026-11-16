"use client";

// From the shadcn base-nova `toggle-group`, trimmed to one chip style on the Base UI primitive
// (`@base-ui/react/toggle-group`). The variant context and the joined (spacing 0) layout are left
// out until a screen needs them.
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "cn";
import * as React from "react";

import { controlHeights, focusRing, touchAreas } from "../theme/tokens.ts";

type ToggleGroupSize = "sm" | "md";

const ToggleGroupSizeContext = React.createContext<ToggleGroupSize>("sm");

/**
 * `size` sets every chip: sm (32 px, the default) in a dense place, md (36 px from `lg`, 40 px
 * under it) in a row beside md fields and buttons, so the row keeps one height (C06-2).
 */
function ToggleGroup<Value extends string>({
  className,
  size = "sm",
  ...props
}: ToggleGroupPrimitive.Props<Value> & { readonly size?: ToggleGroupSize }) {
  return (
    <ToggleGroupSizeContext.Provider value={size}>
      <ToggleGroupPrimitive
        data-slot="toggle-group"
        className={cn("flex flex-wrap items-center gap-2", className)}
        {...props}
      />
    </ToggleGroupSizeContext.Provider>
  );
}

/** One chip: a pill of the group's size with a 44 px hit area, filled while pressed (tokens.md, "Buttons"). */
function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  const size = React.useContext(ToggleGroupSizeContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        controlHeights[size],
        touchAreas[size],
        "inline-flex shrink-0 items-center justify-center rounded-full border border-input bg-card px-3 text-sm font-medium whitespace-nowrap text-foreground select-none motion-safe:transition-colors not-data-pressed:hover:bg-hover data-pressed:border-transparent data-pressed:bg-primary data-pressed:text-primary-foreground disabled:pointer-events-none disabled:opacity-50",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
