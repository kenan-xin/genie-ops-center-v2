// From the shadcn base-nova `button-group`, trimmed to the horizontal layout. The orientation
// variant, `ButtonGroupText`, `ButtonGroupSeparator` and the select and input rules are left out
// until a screen needs them.
import { cn } from "cn";

/** Joins its direct children into one control: one outer border, square inner corners. */
function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 *:data-slot:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
        className
      )}
      {...props}
    />
  );
}

export { ButtonGroup };
