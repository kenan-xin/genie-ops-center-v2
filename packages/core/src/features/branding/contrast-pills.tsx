"use client";

import { StatusPill } from "@genie/ui";

import {
  brandingContrastPairs,
  type ContrastPairId,
} from "../../lib/branding/contrast-pairs.ts";

const LABELS: Record<ContrastPairId, string> = {
  "fill": "Fill",
  "text-on-nav": "Text on nav",
  "count-pill": "Count pill",
  "focus-ring": "Focus ring",
};

/** Truncated, never rounded up, so a failing 4.496 never reads as 4.50. */
function ratioText(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/**
 * The four R-46 checks, each with its ratio, its target and a Pass or Fail word, so the result
 * reads without color. There is no Fix action: the administrator picks another color.
 */
export function ContrastPills(props: { readonly primaryColor: string }) {
  return (
    <ul aria-label="Contrast checks" className="grid gap-2 sm:grid-cols-2">
      {brandingContrastPairs(props.primaryColor).map((pair) => (
        <li
          key={pair.id}
          className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
        >
          <span className="font-medium">{LABELS[pair.id]}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono">{ratioText(pair.ratio)}</span>
            <span className="text-xs text-muted-foreground">
              target {pair.target === 3 ? "3:1" : "4.5:1"}
            </span>
            <StatusPill tone={pair.ok ? "success" : "danger"}>
              {pair.ok ? "Pass" : "Fail"}
            </StatusPill>
          </span>
        </li>
      ))}
    </ul>
  );
}
