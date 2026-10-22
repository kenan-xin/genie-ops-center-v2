"use client";

import { CircleHelpIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/collapsible.tsx";

export function HelpDisclosure(props: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          // One Escape closes only this panel, not a dialog around it (tokens.md, "Overlays").
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <CollapsibleTrigger ref={trigger} render={<Button variant="ghost" />}>
        <CircleHelpIcon aria-hidden="true" />
        {props.label}
      </CollapsibleTrigger>
      <CollapsibleContent role="group" aria-label={props.label}>
        <div className="rounded-lg bg-muted p-3 text-sm text-foreground">
          {props.children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
