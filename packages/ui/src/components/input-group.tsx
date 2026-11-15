"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

import { fieldText, groupControlHeights, touchAreas } from "../theme/tokens.ts";
import { Button } from "./button.tsx";

/*
 * The shadcn Input Group (`@shadcn/input-group`, base style), fitted to this repository: the group
 * carries the border and the one focus ring of tokens.ts, the bare control fills it to the Input sizes, and the
 * button keeps the Button sizes with their 44 px hit area. The textarea control and the
 * `block-end` addon serve the agent composer; `block-start` stays out until a screen needs it.
 */

function InputGroup({
  className,
  onClick,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      onClick={(event) => {
        // A tap on the touch area around the group focuses its field (6wz1.114).
        if (event.target === event.currentTarget)
          event.currentTarget
            .querySelector<HTMLElement>("[data-slot=input-group-control]")
            ?.focus();
        onClick?.(event);
      }}
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-center has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:items-stretch rounded-lg border border-input bg-card motion-safe:transition-colors has-[[data-slot=input-group-control]:disabled]:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-background has-[[data-slot][aria-invalid=true]]:border-destructive",
        touchAreas.md,
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
        // A press on the addon's text focuses the field; a press on a control in it stays the control's.
        if (
          event.target instanceof Element &&
          event.target.closest("button, input, select, textarea, label, a") !==
            null
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

// The bare primitive, not `Input`: the group draws the border, the fill and the focus ring.

function InputGroupInput({
  className,
  size = "md",
  ...props
}: Omit<InputPrimitive.Props, "size"> & {
  size?: keyof typeof groupControlHeights;
}) {
  return (
    <InputPrimitive
      data-slot="input-group-control"
      className={cn(
        "w-full min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
        groupControlHeights[size],
        size === "lg" ? "field-text lg:text-base" : fieldText,
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
        "max-h-36 min-h-11 w-full min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
        fieldText,
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
