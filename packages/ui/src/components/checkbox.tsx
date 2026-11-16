"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import { CheckIcon } from "lucide-react";

import { focusRing, touchAreas } from "../theme/tokens.ts";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Under lg the touch area grows the 16 px box to 44 px; a hand-set inset counted from inside
        // the border and fell 2 px short.
        touchAreas.md,
        "peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input motion-safe:transition-colors aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:bg-input/30 dark:data-checked:bg-primary",
        focusRing,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
