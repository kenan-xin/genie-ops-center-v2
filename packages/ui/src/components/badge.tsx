import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// The pills of tokens.md, "Pills and chips". The status tones are fixed
// palette colors with no role, so this file is a `shadcn/no-raw-colors` exception.
const neutral = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        success:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        neutral,
        danger: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        warning:
          "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        label: neutral,
        mono: `${neutral} px-1.5 py-px font-mono font-medium tracking-wide uppercase`,
        count: "bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
