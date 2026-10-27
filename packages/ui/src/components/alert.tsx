import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-leading-icon has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        // tokens.md, "Warning note": amber-800 on amber-50, amber-200 on amber-900/30 in dark.
        warning:
          "border-0 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
        // tokens.md: an informational callout keeps its fixed blue, never the tenant color.
        info: "border-0 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100",
        destructive:
          "bg-card text-destructive dark:text-destructive-on-dark *:data-[slot=alert-description]:text-destructive/90 dark:*:data-[slot=alert-description]:text-destructive-on-dark/90 *:[svg]:text-current",
      },
      // tokens.md, "Warning note": `sm` under a control, `md` at the top of a card or a sheet.
      size: {
        default: "",
        sm: "gap-1.5 px-2.5 py-1.5 text-xs has-[>svg]:gap-x-1.5 *:[svg]:translate-y-px",
        md: "gap-2.5 px-3.5 py-3 text-sm has-[>svg]:gap-x-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Alert({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
