import { colorRoles } from "@genie/ui/tokens";

import { contrastRatio, foregroundFor } from "./foreground.ts";

export type ContrastPairId =
  | "fill"
  | "text-on-nav"
  | "count-pill"
  | "focus-ring";

export type ContrastPair = {
  readonly id: ContrastPairId;
  readonly ratio: number;
  readonly target: 4.5 | 3;
  readonly ok: boolean;
};

function pair(
  id: ContrastPairId,
  ratio: number,
  target: 4.5 | 3
): ContrastPair {
  return { id, ratio, target, ok: ratio >= target };
}

/**
 * The four R-46 checks of a tenant color, in pill order. Fill and Count pill test the stored
 * foreground on the color, Text on nav tests the color on the light navigation surface, and the
 * Focus ring takes the lower ratio against white and the subtle surface. The browser and the
 * publish service share this one rule.
 */
export function brandingContrastPairs(
  primaryColor: string
): readonly ContrastPair[] {
  const onColor = contrastRatio(foregroundFor(primaryColor), primaryColor);
  const onNav = contrastRatio(primaryColor, colorRoles.light.background);

  const ring = Math.min(
    onNav,
    contrastRatio(primaryColor, colorRoles.light.muted)
  );

  return [
    pair("fill", onColor, 4.5),
    pair("text-on-nav", onNav, 4.5),
    pair("count-pill", onColor, 4.5),
    pair("focus-ring", ring, 3),
  ];
}

export function brandingContrastPasses(primaryColor: string): boolean {
  return brandingContrastPairs(primaryColor).every((check) => check.ok);
}
