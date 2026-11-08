"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

import { Button } from "./button.tsx";

/*
 * The shadcn Input Group (`@shadcn/input-group`, base style), fitted to this repository: the group
 * carries the border and the one focus ring of tokens.ts, the bare control fills it to the Input sizes, and the
 * button keeps the Button sizes with their 44 px hit area. The textarea control and the
 * `block-end` addon serve the agent composer; `block-start` stays out until a screen needs it.
 */

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-center has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:items-stretch rounded-lg border border-input bg-card motion-safe:transition-colors has-[[data-slot=input-group-control]:disabled]:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-background has-[[data-slot][aria-invalid=true]]:border-destructive",
        className
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  // No vertical padding on an inline addon: the control alone sets the group's height (6wz1.94).
  "flex h-auto cursor-text items-center justify-center gap-2 text-sm font-medium text-muted-foreground select-none [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-2 has-[>button]:-ml-0.5",
        "inline-end": "order-last pr-2 has-[>button]:-mr-0.5",
        "block-end": "order-last w-full justify-start px-2 pt-1.5 pb-2",
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

        event.currentTarget.parentElement
          ?.querySelector<HTMLElement>("[data-slot=input-group-control]")
          ?.focus();
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

// The Input sizes less the group's two 1 px borders, so the group is as high as an Input:
// md the field height (tokens.ts `fieldHeight`), sm 32 px, lg 44 px.
const groupInputSizes = {
  sm: "h-7.5 min-h-7.5",
  md: "h-10.5 min-h-10.5 lg:h-8.5 lg:min-h-8.5",
  lg: "h-10.5 min-h-10.5 text-base",
} as const;

// The bare primitive, not `Input`: the group draws the border, the fill and the focus ring.

function InputGroupInput({
  className,
  size = "md",
  ...props
}: Omit<InputPrimitive.Props, "size"> & {
  size?: keyof typeof groupInputSizes;
}) {
  return (
    <InputPrimitive
      data-slot="input-group-control"
      className={cn(
        "w-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
        groupInputSizes[size],
        className
      )}
      {...props}
    />
  );
}

// A bare textarea for the same reason: the group draws the border, the fill and the one ring.
function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "max-h-36 min-h-11 w-full min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
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
  InputGroupTextarea,
};
