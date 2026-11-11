"use client";

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import { cn } from "cn";
import type React from "react";

import { focusRing } from "../theme/tokens.ts";

function Toolbar({
  className,
  ...props
}: ToolbarPrimitive.Root.Props): React.ReactElement {
  return (
    <ToolbarPrimitive.Root
      className={cn(
        "relative flex gap-2 rounded-xl border bg-card not-dark:bg-clip-padding p-1 text-foreground",
        className
      )}
      data-slot="toolbar"
      {...props}
    />
  );
}

/** One labelled tool: its icon above its name, a 52 by 60 px target (czjw.156). */
function ToolbarButton({
  className,
  ...props
}: ToolbarPrimitive.Button.Props): React.ReactElement {
  return (
    <ToolbarPrimitive.Button
      className={cn(
        "flex min-h-13 min-w-15 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold text-muted-foreground not-disabled:hover:bg-muted data-popup-open:bg-primary/8 data-popup-open:text-primary [&_svg]:size-5",
        focusRing,
        className
      )}
      data-slot="toolbar-button"
      {...props}
    />
  );
}

export { Toolbar, ToolbarButton };
