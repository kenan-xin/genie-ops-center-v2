"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

import { focusRing } from "../theme/tokens.ts";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // The after: element grows the 24 px track to a 44 px hit area.
        "peer relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 motion-safe:transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 aria-invalid:ring-2 aria-invalid:ring-destructive data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50",
        focusRing,
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-white motion-safe:transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
