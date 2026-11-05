"use client";

import type { ReactNode } from "react";

import { QuietFold } from "./chat-parts.tsx";

/**
 * The one quiet line where the summary of a long chat starts (S7-34): a divider with the summary
 * in a fold. The messages before it stay shown; the model reads the summary in their place.
 */
export function SummaryLine(props: { readonly summary: string }): ReactNode {
  return (
    <div className="border-t border-border pt-1">
      <QuietFold label="Earlier messages were summarized">
        <p className="ps-5 pb-1 text-sm whitespace-pre-wrap text-muted-foreground">
          {props.summary}
        </p>
      </QuietFold>
    </div>
  );
}
