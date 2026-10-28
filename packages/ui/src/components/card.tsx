import { cn } from "cn";
import * as React from "react";

// Adapted from @shadcn/card (base style) to the fixed token layer: fixed padding instead of the
// `--card-spacing` property, and a `divided` variant whose rows carry their own padding, so a
// table or a list can run from edge to edge (account captures).
const cardVariants = {
  default: "gap-4 py-4",
  divided: "divide-y divide-border",
} as const;

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: keyof typeof cardVariants }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-xl bg-card text-sm text-foreground ring-1 ring-foreground/10",
        cardVariants[variant],
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1 px-4 group-data-[variant=divided]/card:py-4 has-data-[slot=card-action]:grid-cols-header-action md:px-5 md:group-data-[variant=divided]/card:py-5",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-base leading-snug font-medium", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-4 group-data-[variant=divided]/card:py-4 md:px-5",
        className
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-border bg-muted p-4",
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
