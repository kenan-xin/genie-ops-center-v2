import type { ElementKind } from "../contract.ts";

/** The one canvas every deck is laid out on, on screen and in PowerPoint (D10). */
export const CANVAS = { width: 960, height: 540 } as const;

export type Box = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type SlideBoxes = {
  readonly title: Box;
  readonly rule: Box;
  readonly body: readonly { readonly index: number; readonly box: Box }[];
  readonly footer: Box;
};

/**
 * Font sizes in canvas pixels; the export multiplies them by 0.75 for points (D10). The screen's
 * KPI uses `text-3xl` (30 px) in the Chart part, so `figure` stays equal to it.
 */
export const TYPE_PX = {
  title: 32,
  text: 18,
  bullet: 18,
  figure: 30,
  caption: 12,
  footer: 12,
} as const;

const MARGIN_X = 40;

const CONTENT_W = 880;

const BODY_Y = 136;

const BODY_H = 348;

const COLUMN_GAP = 16;

const TEXT_W = 320;

const VISUAL_X = 384;

const VISUAL_W = 536;

/** A table and another visual share the text column: the body on top, the visual below. */
const SPLIT_BODY_H = 192;

const SPLIT_VISUAL_H = BODY_H - SPLIT_BODY_H - COLUMN_GAP;

const BODY_KINDS: ReadonlySet<ElementKind> = new Set(["text", "bullets"]);

const VISUAL_KINDS: ReadonlySet<ElementKind> = new Set([
  "figure",
  "chart",
  "table",
  "image",
]);

/**
 * Places every element of one slide on the 960 x 540 canvas. The title is always first; a body and
 * visuals share the row, and one kind alone takes the full width. A table needs about 400 px of
 * column, so it takes the wide visual column and any other visual moves into the text column
 * (round 1 I1); without a table, two visuals sit side by side. Adjacent boxes touch and never
 * overlap, so the screen and the export draw the same slide.
 */
export function slideLayout(kinds: readonly ElementKind[]): SlideBoxes {
  const visuals = kinds.filter((kind) => VISUAL_KINDS.has(kind)).length;
  const hasBody = kinds.some((kind) => BODY_KINDS.has(kind));
  const hasTable = kinds.includes("table");
  const otherVisuals = hasTable ? visuals - 1 : visuals;
  const body: { index: number; box: Box }[] = [];
  let visualAt = 0;
  let tablePlaced = false;

  for (const [index, kind] of kinds.entries()) {
    // The title has its own box above the rule.
    if (index === 0) continue;

    if (BODY_KINDS.has(kind)) {
      body.push({
        index,
        box: {
          x: MARGIN_X,
          y: BODY_Y,
          w: hasBody && visuals > 0 ? TEXT_W : CONTENT_W,
          h: hasTable && otherVisuals > 0 ? SPLIT_BODY_H : BODY_H,
        },
      });

      continue;
    }

    if (!VISUAL_KINDS.has(kind)) continue;

    if (kind === "table" && !tablePlaced) {
      tablePlaced = true;

      const shares = hasBody || otherVisuals > 0;

      body.push({
        index,
        box: {
          x: shares ? VISUAL_X : MARGIN_X,
          y: BODY_Y,
          w: shares ? VISUAL_W : CONTENT_W,
          h: BODY_H,
        },
      });

      continue;
    }

    if (hasTable) {
      body.push({
        index,
        box: {
          x: MARGIN_X,
          y: hasBody ? BODY_Y + SPLIT_BODY_H + COLUMN_GAP : BODY_Y,
          w: TEXT_W,
          h: hasBody ? SPLIT_VISUAL_H : BODY_H,
        },
      });

      continue;
    }

    const total = hasBody ? VISUAL_W : CONTENT_W;
    const width = (total - COLUMN_GAP * (visuals - 1)) / visuals;

    body.push({
      index,
      box: {
        x: (hasBody ? VISUAL_X : MARGIN_X) + visualAt * (width + COLUMN_GAP),
        y: BODY_Y,
        w: width,
        h: BODY_H,
      },
    });

    visualAt += 1;
  }

  return {
    title: { x: MARGIN_X, y: 32, w: CONTENT_W, h: 88 },
    rule: { x: MARGIN_X, y: 120, w: CONTENT_W, h: 4 },
    body,
    footer: { x: MARGIN_X, y: 500, w: CONTENT_W, h: 24 },
  };
}

const FIGURES_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "27 Oct 2026": a figures date read in UTC, so it never moves a day (R-54). */
export function figuresDate(value: string): string {
  return FIGURES_DATE.format(new Date(`${value}T00:00:00Z`));
}
