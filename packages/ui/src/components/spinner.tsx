import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

function Spinner({
  className,
  label = "Loading",
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  readonly label?: string;
}) {
  return (
    <span
      data-slot="spinner"
      role="status"
      className={cn("inline-flex", className)}
      {...props}
    >
      <Loader2Icon
        aria-hidden="true"
        className="size-4 motion-safe:animate-spin"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner };
