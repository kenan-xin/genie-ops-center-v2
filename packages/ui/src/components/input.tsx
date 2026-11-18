import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

import {
  controlHeights,
  fieldText,
  focusRing,
  touchAreas,
} from "../theme/tokens.ts";

const inputSizes = {
  sm: cn(controlHeights.sm, fieldText),
  md: cn(controlHeights.md, fieldText),
  lg: cn(controlHeights.lg, "field-text lg:text-base"),
  dense: cn(controlHeights.dense, fieldText),
} as const;

// P06-4: a bare <input> cannot draw `::after`, so a box carries the 44 px touch area (6wz1.114).
const boxTouchAreas = {
  sm: touchAreas.sm,
  md: touchAreas.md,
  lg: "",
  dense: touchAreas.md,
} as const;

/**
 * The field and its box. `className` places the box (a layout class such as `max-w-30`); every
 * other prop, `ref` and ARIA included, lands on the `<input>`.
 */
function Input({
  className,
  size = "md",
  ...props
}: Omit<InputPrimitive.Props, "size"> & { size?: keyof typeof inputSizes }) {
  return (
    <span
      data-slot="input-box"
      className={cn("flex w-full min-w-0", boxTouchAreas[size], className)}
      onClick={(event) => {
        // A tap on the touch area around the field focuses it, as an addon does in a group.
        if (event.target === event.currentTarget)
          event.currentTarget.querySelector("input")?.focus();
      }}
    >
      <InputPrimitive
        data-slot="input"
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-foreground motion-safe:transition-colors file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          inputSizes[size],
          focusRing
        )}
        {...props}
      />
    </span>
  );
}

export { Input };
