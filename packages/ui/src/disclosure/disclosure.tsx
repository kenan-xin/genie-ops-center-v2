"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

export type DisclosureProps = {
  readonly summary: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
};

export function Disclosure(props: DisclosureProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const regionId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        {props.summary}
      </button>
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
