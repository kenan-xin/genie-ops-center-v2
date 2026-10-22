"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Loader2Icon } from "lucide-react";
import * as React from "react";

import { focusRing } from "../theme/tokens.ts";

// A 32 px control owns an invisible 44 px hit area (tokens.md, "Buttons").
const hitArea = "relative after:absolute after:-inset-1.5";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap motion-safe:transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground not-disabled:not-aria-disabled:hover:bg-primary/90 not-disabled:not-aria-disabled:active:bg-primary/80",
        secondary:
          "border-input bg-card text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        danger:
          "bg-destructive text-white not-disabled:not-aria-disabled:hover:bg-destructive/90 not-disabled:not-aria-disabled:active:bg-destructive/80",
        ghost: "text-foreground not-disabled:not-aria-disabled:hover:bg-muted",
        link: "text-primary underline-offset-4 not-disabled:not-aria-disabled:hover:underline dark:text-brand-on-dark",
      },
      size: {
        "sm": `h-8 min-h-8 px-3 ${hitArea}`,
        "md": "h-10 min-h-10 px-4",
        "lg": "h-11 min-h-11 px-5",
        "icon": "size-11 lg:size-10",
        "icon-sm": `size-8 ${hitArea}`,
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

const isLeadingIcon = (node: React.ReactNode) =>
  React.isValidElement<{ "data-icon"?: string }>(node) &&
  node.props["data-icon"] === "inline-start";

function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  onClick,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  }) {
  // The spinner takes the place of the leading icon, so the width stays.
  const nodes = React.Children.toArray(children);

  const spinner = (
    <Loader2Icon
      key="spinner"
      aria-hidden="true"
      data-icon="inline-start"
      className="motion-safe:animate-spin"
    />
  );

  const hasLeadingIcon = nodes.some(isLeadingIcon);

  const loadingContent = hasLeadingIcon
    ? nodes.map((node) => (isLeadingIcon(node) ? spinner : node))
    : [spinner, ...nodes];

  const content = loading ? loadingContent : children;

  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), focusRing, className)}
      onClick={(event) => {
        // A submit button still submits on a dropped click, so cancel it too.
        if (loading) {
          event.preventDefault();

          return;
        }

        onClick?.(event);
      }}
      {...props}
    >
      {content}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
