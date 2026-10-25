"use client";

import { StatusPill } from "@genie/ui";

import type {
  ContrastPair,
  ContrastPairId,
} from "../../lib/branding/contrast-pairs.ts";

const LABELS: Record<ContrastPairId, string> = {
  "fill": "Fill",
  "text-on-nav": "Text on nav",
  "count-pill": "Count pill",
  "focus-ring": "Focus ring",
  "sign-in-text": "Sign-in text",
};

const LEVELS = {
  pass: { tone: "success", word: "Pass" },
  warning: { tone: "warning", word: "Warning" },
  fail: { tone: "danger", word: "Fail" },
} as const;

/** Truncated, never rounded up, so a failing 4.496 never reads as 4.50. */
function ratioText(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/**
 * R-46 checks, each with its ratio, its target and a Pass, Warning or Fail word, so the result
 * reads without color. Only Fail blocks Publish. There is no Fix action: the administrator picks
 * another color.
 */
export function ContrastPills(props: {
  readonly pairs: readonly ContrastPair[];
}) {
  return (
    <ul aria-label="Contrast checks" className="grid gap-2 sm:grid-cols-2">
      {props.pairs.map((pair) => (
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
            <StatusPill tone={LEVELS[pair.level].tone}>
              {LEVELS[pair.level].word}
            </StatusPill>
          </span>
        </li>
      ))}
    </ul>
  );
}
