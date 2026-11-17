"use client";

// From the shadcn base-nova `toggle-group`, on the Base UI primitive (`@base-ui/react/toggle-group`),
// drawn as the one segmented control of DESIGN.md (6wz1.105): a tinted track, the selected segment
// white with a hairline. The variant context and a spaced chip row are left out until a screen
// needs them.
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "cn";
import * as React from "react";

import { controlHeights, focusRing, touchAreas } from "../theme/tokens.ts";

type ToggleGroupSize = "sm" | "md";

const ToggleGroupSizeContext = React.createContext<ToggleGroupSize>("sm");

/**
 * `size` sets the track's height: sm (32 px, the default) in a dense place, md (36 px from `lg`,
 * 40 px under it) in a row beside md fields and buttons, so the row keeps one height (C06-2).
 * The track is as wide as its segments (`w-fit`), also in a grid cell or a flex column.
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
        className={cn(
          controlHeights[size],
          "inline-flex w-fit items-center rounded-lg bg-tile p-0.75",
          className
        )}
        {...props}
      />
    </ToggleGroupSizeContext.Provider>
  );
}

/**
 * One segment, at least 44 px wide with a 44 px touch area. The selected one is white with a
 * hairline and casts no shadow (DESIGN.md, the Hairline-First Rule); the others take the hover layer.
 */
function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  const size = React.useContext(ToggleGroupSizeContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        touchAreas[size],
        "inline-flex h-full min-w-11 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground select-none motion-safe:transition-colors not-data-pressed:hover:bg-hover not-data-pressed:hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-card data-pressed:text-foreground data-pressed:inset-ring data-pressed:inset-ring-border [&_svg]:size-4 [&_svg]:shrink-0",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
