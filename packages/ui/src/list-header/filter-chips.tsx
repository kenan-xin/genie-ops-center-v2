"use client";

import { cn } from "cn";
import { XIcon } from "lucide-react";
import { useRef } from "react";

import { focusRing } from "../theme/tokens.ts";

export type FilterChip = {
  readonly id: string;
  readonly label: string;
  /** A set value tints the chip, as it tints a filter control (`filter-set`). */
  readonly set: boolean;
  /** A chip without it, such as the date range, has no remove button. */
  readonly remove?:
    | { readonly name: string; readonly onRemove: () => void }
    | undefined;
};

/** The applied filters of a phone header, in one row that scrolls sideways (`czjw.159`). */
export function FilterChips(props: {
  readonly label: string;
  readonly chips: readonly FilterChip[];
}) {
  const list = useRef<HTMLUListElement>(null);

  // The removed button leaves the page, so the focus moves to the next chip's remove button,
  // else the previous one, else the row, never to the body (WCAG 2.4.3, as 6wz1.98).
  function remove(button: HTMLButtonElement, onRemove: () => void) {
    const buttons = [...(list.current?.querySelectorAll("button") ?? [])];
    const at = buttons.indexOf(button);
    const target = buttons[at + 1] ?? buttons[at - 1];
    onRemove();
    (target ?? list.current)?.focus();
  }

  return (
    // A row that scrolls sideways also clips up and down; py-1 keeps the 4 px that the remove
    // target reaches above and below a 36 px chip.
    <ul
      ref={list}
      aria-label={props.label}
      tabIndex={-1}
      className={cn("flex gap-2 overflow-x-auto py-1", focusRing)}
    >
      {props.chips.map((chip) => (
        <li key={chip.id} className="shrink-0">
          <span
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium whitespace-nowrap",
              chip.set
                ? "border-primary/40 bg-primary/8 font-semibold text-primary dark:text-brand-on-dark"
                : "border-border bg-card text-foreground",
              chip.remove && "pr-1"
            )}
          >
            {chip.label}
            {chip.remove ? (
              <button
                type="button"
                aria-label={chip.remove.name}
                onClick={(event) => {
                  if (chip.remove) {
                    remove(event.currentTarget, chip.remove.onRemove);
                  }
                }}
                // 28 px and 8 px on each side make the 44 px target (DESIGN.md, touch targets).
                className={cn(
                  "relative inline-flex size-7 items-center justify-center rounded-full after:absolute after:-inset-2 hover:bg-primary/14 motion-safe:transition-colors",
                  focusRing
                )}
              >
                <XIcon aria-hidden className="size-4" />
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
