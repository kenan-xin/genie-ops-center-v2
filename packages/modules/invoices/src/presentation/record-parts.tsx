import type { ReactNode } from "react";

import { HistoryList, LINKS_LABEL } from "./allocations.tsx";
import type { LinkedRecord } from "./history-text.ts";
import { RecordLinks } from "./link-dialogs.tsx";
import type { AllocationRow, HistoryRow } from "./views.ts";

/**
 * A record's links and their history, in the desk's drawer (`cards`) or in its phone sheet
 * (`auto`, a table from 768 px): the links with their count and action, then History, newest first
 * (R-38a, prototype variant C).
 */
export function RecordSide(props: {
  readonly id: string;
  readonly other: LinkedRecord;
  readonly allocations: readonly AllocationRow[];
  readonly history: readonly HistoryRow[];
  readonly canWrite: boolean;
  readonly timeZone: string;
  /** An action on the links, such as "Link to an invoice". */
  readonly linkAction?: ReactNode;
  readonly layout: "auto" | "cards";
}): ReactNode {
  const { other } = props;
  // Both places render, one hidden by width, so each id carries its place.
  const id = `${props.id}-${props.layout === "cards" ? "drawer" : "sheet"}`;

  return (
    <>
      <section aria-labelledby={`${id}-links`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${id}-links`} className="text-base font-semibold">
            {LINKS_LABEL[other]}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              {`${props.allocations.length} linked`}
            </span>
            {props.linkAction}
          </div>
        </div>
        <RecordLinks
          rows={props.allocations}
          other={other}
          canWrite={props.canWrite}
          layout={props.layout}
        />
      </section>
      <section
        aria-labelledby={`${id}-history`}
        className="flex flex-col gap-2"
      >
        <h2 id={`${id}-history`} className="text-base font-semibold">
          History
        </h2>
        {props.history.length === 0 ? (
          <p className="text-sm">No link has changed yet.</p>
        ) : (
          <HistoryList
            rows={props.history}
            other={other}
            timeZone={props.timeZone}
          />
        )}
      </section>
    </>
  );
}
