"use client";

import type { ReactNode } from "react";

import { QuietFold } from "./chat-parts.tsx";
import { summaryForPerson } from "./summary.ts";

/**
 * The one quiet line where the summary of a long chat starts (S7-34): a divider with the summary
 * in a fold. The messages before it stay shown; the model reads the summary in their place.
 */
export function SummaryLine(props: {
  readonly summary: string;
  /** A dataset's name to its title: the fold never shows a dataset name. */
  readonly datasetTitles: Readonly<Record<string, string>>;
}): ReactNode {
  return (
    <div className="border-t border-border pt-1">
      <QuietFold label="Earlier messages were summarized">
        <p className="ps-5 pb-1 text-sm whitespace-pre-wrap text-muted-foreground">
          {summaryForPerson(props.summary, props.datasetTitles)}
        </p>
      </QuietFold>
    </div>
  );
}
