"use client";

import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

import { focusRing, iconLeadPx } from "../theme/tokens.ts";

export type DisclosureProps = {
  readonly summary: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  /** A control beside the summary, outside its button, for example an info icon. */
  readonly aside?: ReactNode;
};

export function Disclosure(props: DisclosureProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const regionId = useId();

  const summary = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={regionId}
      onClick={() => setOpen((value) => !value)}
      // The look of a native fold's summary: a chevron that turns, so the trigger reads as one.
      className={`group inline-flex min-h-8 items-center gap-1 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground ${focusRing}`}
    >
      {/* The ink starts 5.4 px into the box, 3.4 px once turned, so the hang follows the turn and
          the ink meets the body's edge (6wz1.113, P07-52, P07-58). */}
      <ChevronRightIcon
        aria-hidden="true"
        strokeWidth={1.75}
        className={`size-4 transition-transform group-aria-expanded:-start-1 group-aria-expanded:rotate-90 motion-reduce:transition-none ${iconLeadPx[5]}`}
      />
      {props.summary}
    </button>
  );

  return (
    <div>
      {props.aside === undefined ? (
        summary
      ) : (
        <div className="flex items-center gap-1">
          {summary}
          {props.aside}
        </div>
      )}
      {/* Always mounted, so aria-controls always names an element that exists. */}
      <div
        id={regionId}
        role="region"
        aria-label={props.summary}
        hidden={!open}
      >
        {props.children}
      </div>
    </div>
  );
}
