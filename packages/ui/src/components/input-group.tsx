"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

import { Button } from "./button.tsx";
import { inputSizes } from "./input.tsx";

/*
 * The shadcn Input Group (`@shadcn/input-group`, base style), fitted to this repository: the group
 * carries the border and the one focus ring of tokens.ts, the bare control keeps the Input sizes, and the
 * button keeps the Button sizes with their 44 px hit area. The textarea control and the block
 * addons are left out until a screen needs them.
 */

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-center rounded-lg border border-input bg-card motion-safe:transition-colors has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-background has-[[data-slot][aria-invalid=true]]:border-destructive",
        className
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-2 has-[>button]:-ml-0.5",
        "inline-end": "order-last pr-2 has-[>button]:-mr-0.5",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(event) => {
        // A press on the addon's text focuses the field; a press on its button stays the button's.
        if (
          event.target instanceof Element &&
          event.target.closest("button") !== null
        )
          return;

        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "icon-sm",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & {
  type?: "button" | "submit" | "reset";
}) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      size={size}
      className={className}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

// Inside the group's 1 px border, so the group is as high as a `filter` Button.
const FILTER_SIZE = "h-10.5 min-h-10.5 lg:h-8.5 lg:min-h-8.5";

// The bare primitive, not `Input`: the group draws the border, the fill and the focus ring.

function InputGroupInput({
  className,
  size = "md",
  ...props
}: Omit<InputPrimitive.Props, "size"> & {
  /** `filter`: a 44 px group under 1024 px and 36 px in the desktop bar, for a list filter. */
  size?: keyof typeof inputSizes | "filter";
}) {
  return (
    <InputPrimitive
      data-slot="input-group-control"
      className={cn(
        "w-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        size === "filter" ? FILTER_SIZE : inputSizes[size],
        className
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
};
