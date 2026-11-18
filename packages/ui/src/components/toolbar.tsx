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
      className={cn("relative flex gap-1 text-foreground", className)}
      data-slot="toolbar"
      {...props}
    />
  );
}

/** One labelled tool: its icon above its name, a 52 by 60 px target; the tools share the row equally (czjw.156, czjw.176). */
function ToolbarButton({
  className,
  ...props
}: ToolbarPrimitive.Button.Props): React.ReactElement {
  return (
    <ToolbarPrimitive.Button
      className={cn(
        "flex min-h-13 min-w-15 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold text-muted-foreground not-disabled:hover:bg-hover data-popup-open:bg-primary/8 data-popup-open:text-primary [&_svg]:size-5",
        focusRing,
        className
      )}
      data-slot="toolbar-button"
      {...props}
    />
  );
}

export { Toolbar, ToolbarButton };
