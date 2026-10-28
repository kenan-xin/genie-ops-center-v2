import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

import { focusRing } from "../theme/tokens.ts";

const inputSizes = {
  sm: "h-8 min-h-8",
  md: "h-10 min-h-10",
  lg: "h-11 min-h-11 text-base",
} as const;

function Input({
  className,
  size = "md",
  ...props
}: Omit<InputPrimitive.Props, "size"> & { size?: keyof typeof inputSizes }) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground motion-safe:transition-colors file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        inputSizes[size],
        focusRing,
        className
      )}
      {...props}
    />
  );
}

export { Input, inputSizes };
