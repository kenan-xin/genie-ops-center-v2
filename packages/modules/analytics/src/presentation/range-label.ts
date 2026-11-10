import { formatDayRange } from "@genie/ui";

import { DATE_RANGE_PRESETS, type DateRangeFilter } from "../contract.ts";

/** A preset as people read it, in one place: the filter bar and a panel's own-range chip (D3). */
export const PRESET_LABEL: Record<(typeof DATE_RANGE_PRESETS)[number], string> =
  {
    "all": "All time",
    "this-month": "This month",
    "last-3-months": "Last 3 months",
    "last-6-months": "Last 6 months",
    "this-year": "This year",
  };

/** A range as the bar's trigger and a panel's chip read it. */
export const rangeLabel = (range: DateRangeFilter) =>
  "preset" in range
    ? PRESET_LABEL[range.preset]
    : formatDayRange(range.from, range.to);
