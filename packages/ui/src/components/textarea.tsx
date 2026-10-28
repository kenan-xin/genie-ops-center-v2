import { cn } from "cn";
import * as React from "react";

import { focusRing } from "../theme/tokens.ts";

// Adapted from @shadcn/textarea (base style) to the fixed token layer: the card fill, padding,
// text size and shared focus ring of Input, so a textarea and an input read as one control family.
// No `field-sizing-content`: it overrides `rows`, and a caller that sets four rows keeps its height.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground motion-safe:transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
