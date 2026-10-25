import { colorRoles } from "@genie/ui/tokens";

import { contrastRatio, foregroundFor } from "./foreground.ts";

export type ContrastPairId =
  | "fill"
  | "text-on-nav"
  | "count-pill"
  | "focus-ring"
  | "sign-in-text";

/** `fail` blocks Publish; `warning` only marks a text pair under its 4.5:1 target (R-46). */
export type ContrastLevel = "pass" | "warning" | "fail";

export type ContrastPair = {
  readonly id: ContrastPairId;
  readonly ratio: number;
  readonly target: 4.5 | 3;
  readonly level: ContrastLevel;
};

/** Below this ratio every pair fails, whatever its target (CR-BRANDING-L2). */
const FLOOR = 3;

function pair(
  id: ContrastPairId,
  ratio: number,
  target: 4.5 | 3
): ContrastPair {
  const level = ratio >= target ? "pass" : ratio >= FLOOR ? "warning" : "fail";

  return { id, ratio, target, level };
}

/**
 * The four R-46 checks of a tenant color, in pill order. Fill and Count pill test the stored
 * foreground on the color, Text on nav tests the color on the light navigation surface, and the
 * Focus ring takes the lower ratio against white and the subtle surface. The three text pairs warn
 * between 3:1 and 4.5:1; the ring targets 3:1, so it has no warning band. The browser and the
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

/**
 * The fifth R-46 check (DR-05): the light theme's text and muted text on the sign-in background,
 * at the lower ratio of the two. The dark sign-in page keeps `--background`, so it needs no pair.
 * A list, so the pills and the Publish rule take it as they take the four.
 */
export function signInContrastPairs(
  background: string
): readonly ContrastPair[] {
  const text = Math.min(
    contrastRatio(colorRoles.light.foreground, background),
    contrastRatio(colorRoles.light["muted-foreground"], background)
  );

  return [pair("sign-in-text", text, 4.5)];
}

/** Publish waits only for a pair below the 3:1 floor; a warning never blocks it (R-46). */
export function contrastAllowsPublish(pairs: readonly ContrastPair[]): boolean {
  return pairs.every((check) => check.level !== "fail");
}
