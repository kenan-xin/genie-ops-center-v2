"use client";

import { Button } from "@genie/ui";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The chat as its own full-height panel (Section 7 redesign, agent-native rule 1): a header with
 * the title, a status dot, an optional "About ..." line and actions, then the conversation, whose
 * composer stays at the bottom.
 */
export function ChatPanel(props: {
  readonly title: string;
  /** What the chat is about, for example "About this dashboard"; cut to one line. */
  readonly about?: string;
  readonly actions?: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section
      aria-label={props.title}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border ps-4 pe-2 md:h-16 md:ps-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-primary"
            />
            {props.title}
            <span className="sr-only">, chat is on</span>
          </h2>
          {props.about === undefined ? null : (
            <p
              title={props.about}
              className="truncate text-xs text-muted-foreground"
            >
              {props.about}
            </p>
          )}
        </div>
        {props.actions}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close the chat"
          onClick={props.onClose}
        >
          <XIcon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
    </section>
  );
}
