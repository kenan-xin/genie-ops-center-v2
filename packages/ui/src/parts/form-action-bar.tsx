"use client";

import { cn } from "cn";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { focusRing } from "../theme/tokens.ts";

/**
 * The action bar of a form that saves (fix list "Save failures"). A failed save shows here as one
 * alert, left of the buttons from 768 px and above them below it, and takes focus so the person
 * hears it. There is no Retry: Save is the retry. `sticky` keeps the bar at the bottom of the
 * screen on a phone, where a page's primary action lives (DESIGN.md). `separated` draws the rule
 * a dialog footer has above it.
 */
export function FormActionBar(props: {
  /** The whole failure copy: what was not saved, the cause, and that the edit is kept. */
  readonly failure: string | null;
  /** The buttons, for example Discard and Save. */
  readonly children: ReactNode;
  readonly sticky?: boolean;
  readonly separated?: boolean;
}) {
  const alert = useRef<HTMLParagraphElement>(null);

  // Each new failure takes focus. A host clears the failure before it saves again, so a repeated
  // failure with the same copy passes through null and takes focus again.
  useEffect(() => {
    if (props.failure !== null) alert.current?.focus();
  }, [props.failure]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        props.sticky &&
          "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-card",
        props.separated && "border-t border-border pt-4"
      )}
    >
      {props.failure === null ? null : (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className={`flex min-w-0 items-start gap-1.5 rounded-sm text-xs text-destructive md:flex-1 dark:text-destructive-on-dark ${focusRing}`}
        >
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{props.failure}</span>
        </p>
      )}
      <div className="flex gap-2 *:flex-1 md:ml-auto md:*:flex-none">
        {props.children}
      </div>
    </div>
  );
}
