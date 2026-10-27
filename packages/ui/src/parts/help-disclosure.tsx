"use client";

import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { CircleHelpIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";

/**
 * Contextual help (tokens.md, "Help disclosure"): a labelled button that opens one 320 px callout
 * on a press. Escape, a click outside and Close shut it, and focus returns to the button. Under
 * 640 px the callout leaves the button and keeps 16 px from each viewport side. `iconOnly` is the
 * toolbar form: the label moves to `aria-label` and `title`.
 */
export function HelpDisclosure(props: {
  readonly label: string;
  readonly children: ReactNode;
  /** The edge of the button the callout lines up with from 640 px. */
  readonly align?: "start" | "end";
  readonly iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const phone = useMediaQuery("(max-width: 639px)", { noSsr: true });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          props.iconOnly ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={props.label}
              title={props.label}
              className="justify-self-start"
            />
          ) : (
            // A grid parent would stretch the button and center its label.
            <Button variant="ghost" className="justify-self-start" />
          )
        }
      >
        <CircleHelpIcon aria-hidden="true" />
        {props.iconOnly ? null : props.label}
      </PopoverTrigger>
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
