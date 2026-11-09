import {
  type ElementBox,
  type ElementKind,
  type ElementStyle,
  SLIDE_CANVAS,
  THEME_BACKGROUND,
} from "../contract.ts";

/** The one canvas every deck is laid out on, on screen and in PowerPoint (D10). */
export const CANVAS = SLIDE_CANVAS;

/** The inner padding of an element with a fill or a border, in canvas pixels (P01-8). */
export const FRAME_PADDING = 12;

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
 * KPI uses `text-3xl` (30 px) in the Chart part, so `figure` stays equal to it; a slide chart's
 * axis and legend labels use `text-base` there, 15 px on the default root, so `label` is 15 (7.4).
 */
export const TYPE_PX = {
  title: 32,
  text: 18,
  bullet: 18,
  figure: 30,
  label: 15,
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
 * column, so it takes the wide visual column and its one other box, a body or a visual, takes
 * the text column (round 1 I1, T4-FIT); without a table, two visuals sit side by side. Adjacent boxes touch and never
 * overlap, so the screen and the export draw the same slide.
 */
export function slideLayout(kinds: readonly ElementKind[]): SlideBoxes {
  const visuals = kinds.filter((kind) => VISUAL_KINDS.has(kind)).length;
  const hasBody = kinds.some((kind) => BODY_KINDS.has(kind));
  const hasTable = kinds.includes("table");
  const body: { index: number; box: Box }[] = [];
  let visualAt = 0;

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
          h: BODY_H,
        },
      });

      continue;
    }

    if (!VISUAL_KINDS.has(kind)) continue;

    // The contract allows one table, beside one body or one other visual (T4-FIT).
    if (kind === "table") {
      const shares = hasBody || visuals > 1;

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
        box: { x: MARGIN_X, y: BODY_Y, w: TEXT_W, h: BODY_H },
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

/**
 * Each element's box: its own stored box, else the computed one of `slideLayout`, so the screen
 * and the export place the same slide (R-52a). The rule and the footer stay computed.
 */
export function elementBoxes(
  elements: readonly {
    readonly kind: ElementKind;
    readonly box?: ElementBox | undefined;
  }[]
): Pick<SlideBoxes, "title" | "body"> {
  const layout = slideLayout(elements.map(({ kind }) => kind));

  return {
    title: elements[0]?.box ?? layout.title,
    body: layout.body.map(({ index, box }) => ({
      index,
      box: elements[index]?.box ?? box,
    })),
  };
}

const THEMED_KINDS: ReadonlySet<ElementKind> = new Set([
  "figure",
  "chart",
  "table",
]);

/**
 * The style an element draws with. A figure, chart or table keeps the theme's text, so on a slide
 * background it draws on the theme background unless it has its own fill (P13-6).
 */
export function drawnStyle(
  kind: ElementKind,
  style: ElementStyle | undefined,
  background: string | undefined
): ElementStyle | undefined {
  if (
    background === undefined ||
    style?.fill !== undefined ||
    !THEMED_KINDS.has(kind)
  ) {
    return style;
  }

  return { ...style, fill: THEME_BACKGROUND };
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
