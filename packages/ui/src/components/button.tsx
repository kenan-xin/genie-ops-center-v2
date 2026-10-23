"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Loader2Icon } from "lucide-react";
import * as React from "react";

import { focusRing } from "../theme/tokens.ts";
import { buttonVariants } from "./button-variants.ts";

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

export { Button };
