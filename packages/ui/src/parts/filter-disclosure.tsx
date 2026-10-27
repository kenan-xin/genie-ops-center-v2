"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";
import { CountPill } from "./pills.tsx";

/**
 * The filter disclosure (tokens.md, "Filter disclosure"): the Filters button with a count of the
 * filters narrowing the list, and one 288 px panel that hangs from the button's left edge and
 * stacks one labelled control per filter. Clear filters sits at the foot while the count is above
 * zero. Escape, a click outside and Close shut it, and focus returns to the button.
 */
export function FilterDisclosure(props: {
  readonly count: number;
  readonly onClear: () => void;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="secondary" />}>
        <SlidersHorizontalIcon aria-hidden="true" />
        Filters
        {props.count > 0 ? <CountPill>{props.count}</CountPill> : null}
      </PopoverTrigger>
      <PopoverContent
        role="group"
        aria-label="Filters"
        align="start"
        collisionPadding={16}
      >
        <div className="flex flex-col gap-3">{props.children}</div>
        <div className="flex items-center gap-3">
          {props.count > 0 ? (
            <Button variant="link" size="sm" onClick={props.onClear}>
              Clear filters
            </Button>
          ) : null}
          <Button variant="link" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
