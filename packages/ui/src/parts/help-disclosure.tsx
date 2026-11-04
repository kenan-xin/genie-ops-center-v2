"use client";

import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { CircleHelpIcon, InfoIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/tooltip.tsx";

/**
 * Contextual help (tokens.md, "Help disclosure"): a labelled button that opens one 320 px callout
 * on a press. Escape, a click outside and Close shut it, and focus returns to the button. Under
 * 640 px the callout leaves the button and keeps 16 px from each viewport side. `iconOnly` is the
 * toolbar form: the label moves to `aria-label` and to a tooltip on hover and keyboard focus.
 * With `hint`, that tooltip shows the hint instead, so an info icon explains itself on hover.
 */
export function HelpDisclosure(props: {
  readonly label: string;
  readonly children: ReactNode;
  /** The edge of the button the callout lines up with from 640 px. */
  readonly align?: "start" | "end";
  readonly iconOnly?: boolean;
  /** With `iconOnly`: the sentence the tooltip shows in place of the label. */
  readonly hint?: string;
  readonly icon?: "help" | "info";
}) {
  const [open, setOpen] = useState(false);
  const Icon = props.icon === "info" ? InfoIcon : CircleHelpIcon;
  const phone = useMediaQuery("(max-width: 639px)", { noSsr: true });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {props.iconOnly ? (
        // One button triggers both: Base UI merges the two triggers through `render`.
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={props.label}
                    className="justify-self-start"
                  />
                }
              />
            }
          >
            <Icon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{props.hint ?? props.label}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger
          // A grid or flex-column parent would stretch the button and center its label.
          render={
            <Button variant="ghost" className="w-fit justify-self-start" />
          }
        >
          <Icon aria-hidden="true" />
          {props.label}
        </PopoverTrigger>
      )}
      <PopoverContent
        role="group"
        aria-label={props.label}
        align={phone ? "center" : (props.align ?? "start")}
        collisionPadding={16}
        className="w-80 max-sm:w-(--available-width)"
      >
        <div className="flex flex-col gap-2 leading-relaxed">
          {props.children}
        </div>
        <Button
          variant="link"
          size="sm"
          className="self-start"
          onClick={() => setOpen(false)}
        >
          Close
        </Button>
      </PopoverContent>
    </Popover>
  );
}
