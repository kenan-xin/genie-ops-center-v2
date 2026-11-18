"use client";

import { Button } from "@genie/ui";
import type { ReactNode } from "react";

const COUNT = new Intl.NumberFormat("en-GB");

/** "1–25 of 1,284", then Previous and Next; one page shows no buttons (access-start b, P12-7). */
export function RangePager(props: {
  readonly from: number;
  readonly to: number;
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly busy: boolean;
  readonly onPage: (step: -1 | 1) => void;
}): ReactNode {
  return (
    <>
      <span className="self-center tabular-nums">
        {`${COUNT.format(props.from)}–${COUNT.format(props.to)} of ${COUNT.format(props.total)}`}
      </span>
      {props.hasPrevious || props.hasNext ? (
        <span className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!props.hasPrevious || props.busy}
            onClick={() => props.onPage(-1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!props.hasNext || props.busy}
            onClick={() => props.onPage(1)}
          >
            Next
          </Button>
        </span>
      ) : null}
    </>
  );
}
