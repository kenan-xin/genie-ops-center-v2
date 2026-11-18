import {
  type ElementBox,
  type ElementKind,
  type ElementStyle,
  SLIDE_CANVAS,
  THEME_BACKGROUND,
  THEME_TEXT,
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

/** WCAG 2.2 large text, in canvas pixels; it needs 3:1, other text 4.5:1 (R-52a). */
export const LARGE_TEXT_PX = 24;

const DEFAULT_TEXT_PX = {
  title: TYPE_PX.title,
  text: TYPE_PX.text,
  bullets: TYPE_PX.bullet,
} as const;

/** The contrast a text needs, by its size or else its kind's default size: the save's one rule. */
export function contrastLimit(
  kind: "title" | "text" | "bullets",
  fontSize: number | undefined
): 3 | 4.5 {
  return (fontSize ?? DEFAULT_TEXT_PX[kind]) >= LARGE_TEXT_PX ? 3 : 4.5;
}

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

export type FrameName = "title" | "statement" | "split";

export type Region = "panel" | "content";

export type SlideFrame = {
  readonly name: FrameName;
  /** The brand block: the left 384 px of a split slide, the whole slide on a title or statement slide. */
  readonly panel: Box;
  /** The ring of a title or statement slide; none on a split slide. */
  readonly ring: Box | null;
  /** The title's box. Its text sits on the box's bottom edge. */
  readonly title: Box;
  /** The other elements, in slide order. A text or bullet list sits on its box's top edge. */
  readonly body: readonly { readonly index: number; readonly box: Box }[];
  /** "Figures as of" at the left, the logo and "<company> · <n> / <count>" at the right; none on a title or statement slide. */
  readonly footer: Box | null;
};

export const PANEL_W = 384;

/** The largest type of each place, in canvas pixels; `fitFontPx` shrinks a title or a text to its box. */
export const LOOK_PX = {
  titleSlideTitle: 60,
  statementTitle: 46,
  splitTitle: 32,
  fullText: 20,
  panelText: 17,
  bigNumber: 86,
  pairNumber: 42,
  figureLabel: 14,
  list: 18,
  listCircle: 31,
  listNumber: 14,
  table: 15,
  denseTable: 13,
  tableHeader: 13,
  caption: 12,
  footer: 12,
} as const;

export const LINE_HEIGHT = { title: 1.15, text: 1.45, list: 1.35 } as const;

/**
 * The split frame's boxes, in canvas pixels, rounded from the prototype's cqw values (1cqw = 9.6).
 * The panel is 40cqw; its padding is 6cqw down and 4.5cqw across, its gap 2.4cqw.
 */
const SPLIT = {
  panel: { x: 0, y: 0, w: PANEL_W, h: 540 }, // 40cqw
  title: { x: 43, y: 58, w: 298, h: 184 }, // 4.5cqw, 6cqw, 31cqw, 19.2cqw
  panelBody: { x: 43, y: 265, w: 298, h: 217 }, // 4.5cqw, 27.6cqw, 31cqw, 22.6cqw
  priorities: { x: 432, y: 58, w: 480, h: 405 }, // 45cqw, 6cqw, 50cqw, 42.2cqw
  chart: { x: 432, y: 117, w: 480, h: 288 }, // 45cqw, 12.2cqw, 50cqw, 70% of the content height
  visual: { x: 432, y: 58, w: 480, h: 405 }, // 45cqw, 6cqw, 50cqw, 42.2cqw
  pairChart: { x: 432, y: 115, w: 225, h: 292 }, // 45cqw, 12cqw, 23.4cqw, 72% of the content height
  pairVisual: { x: 432, y: 58, w: 225, h: 405 }, // 45cqw, 6cqw, 23.4cqw, 42.2cqw
  footer: { x: 422, y: 488, w: 490, h: 24 }, // 44cqw, 3cqw from the bottom, 51cqw, 2.5cqw
} as const;

/** The title frame: the ring is 14cqw at 7cqw. */
const TITLE_FRAME = {
  panel: { x: 0, y: 0, w: 960, h: 540 }, // 100cqw by 56.25cqw
  ring: { x: 758, y: 67, w: 135, h: 135 }, // 7cqw from the right and top, 14cqw square
  title: { x: 67, y: 67, w: 578, h: 247 }, // 7cqw, 7cqw, 60.2cqw, 25.7cqw
  text: { x: 67, y: 337, w: 826, h: 117 }, // 7cqw, 35.1cqw, 86cqw, 12.2cqw
} as const;

/** The statement frame: the ring is 14cqw at 7cqw from the bottom right. */
const STATEMENT_FRAME = {
  panel: { x: 0, y: 0, w: 960, h: 540 }, // 100cqw by 56.25cqw
  ring: { x: 758, y: 338, w: 135, h: 135 }, // 7cqw from the right and bottom, 14cqw square
  title: { x: 67, y: 67, w: 611, h: 212 }, // 7cqw, 7cqw, 63.6cqw, 22.1cqw
  text: { x: 67, y: 302, w: 611, h: 151 }, // 7cqw, 31.5cqw, 63.6cqw, 15.7cqw
} as const;

const TITLE_PX: Record<FrameName, number> = {
  title: LOOK_PX.titleSlideTitle,
  statement: LOOK_PX.statementTitle,
  split: LOOK_PX.splitTitle,
};

/** From the first pair column (45cqw) to the second (71.6cqw). */
const PAIR_STEP = 255;

const LIST_ITEM_H = 49; // two lines of 18px at 1.35

const LIST_ITEM_GAP = 17; // 1.8cqw

const LIST_ITEM_STEP = LIST_ITEM_H + LIST_ITEM_GAP; // 66

const LIST_CIRCLE = 31; // 3.2cqw

const LIST_TEXT_X = 44; // the 3.2cqw circle and its 1.4cqw gap

const FIGURE_RULE_H = 4; // .4cqw border

const FIGURE_RULE_GAP = 19; // 2cqw of padding above the pair's number

const FIGURE_NUMBER_GAP = 10; // 1cqw

const FIGURE_LABEL_H = 20; // the 14px label at 1.45 line height

const FIGURE_LABEL_GAP = 4; // .4cqw

const FIGURE_CAPTION_H = 17; // the 12px caption at 1.45 line height

/** An average character width in em; it errs wide, so a box rarely overflows. */
const AVERAGE_CHARACTER_EM = 0.58;

function splitFrame(kinds: readonly ElementKind[]): SlideFrame {
  const visuals = kinds.filter((kind) => VISUAL_KINDS.has(kind)).length;

  const bothCharts =
    visuals === 2 &&
    kinds.every((kind) => !VISUAL_KINDS.has(kind) || kind === "chart");

  const body: { index: number; box: Box }[] = [];
  let visualAt = 0;

  for (const [index, kind] of kinds.entries()) {
    if (kind === "title") continue;

    if (BODY_KINDS.has(kind)) {
      body.push({
        index,
        box: visuals > 0 ? SPLIT.panelBody : SPLIT.priorities,
      });
      continue;
    }

    if (!VISUAL_KINDS.has(kind)) continue;

    if (visuals === 1) {
      body.push({
        index,
        box: kind === "chart" ? SPLIT.chart : SPLIT.visual,
      });
    } else {
      const pair = bothCharts ? SPLIT.pairChart : SPLIT.pairVisual;

      body.push({
        index,
        box: { ...pair, x: pair.x + visualAt * PAIR_STEP },
      });
    }

    visualAt += 1;
  }

  return {
    name: "split",
    panel: SPLIT.panel,
    ring: null,
    title: SPLIT.title,
    body,
    footer: SPLIT.footer,
  };
}

/** The frame of one slide: a title, a statement or a split, with every box on the canvas. */
export function slideFrame(
  kinds: readonly ElementKind[],
  first: boolean
): SlideFrame {
  if (kinds.every((kind) => kind === "title" || kind === "text")) {
    const frame = first ? TITLE_FRAME : STATEMENT_FRAME;

    return {
      name: first ? "title" : "statement",
      panel: frame.panel,
      ring: frame.ring,
      title: frame.title,
      body: kinds.flatMap((kind, index) =>
        kind === "title" ? [] : [{ index, box: frame.text }]
      ),
      footer: null,
    };
  }

  return splitFrame(kinds);
}

/** Each element's stored box over its frame box, the title included. */
export function placedBoxes(
  elements: readonly {
    readonly kind: ElementKind;
    readonly box?: ElementBox | undefined;
  }[],
  first: boolean
): Pick<SlideFrame, "name" | "title" | "body"> {
  const frame = slideFrame(
    elements.map(({ kind }) => kind),
    first
  );

  const title =
    elements.find(({ kind }) => kind === "title")?.box ?? frame.title;

  return {
    name: frame.name,
    title,
    body: frame.body.map(({ index, box }) => ({
      index,
      box: elements[index]?.box ?? box,
    })),
  };
}

/** A title or statement frame is all panel; a split box is panel when its center is left of the panel. */
export function regionOf(box: Box, frame: FrameName): Region {
  return frame !== "split" || box.x + box.w / 2 < PANEL_W ? "panel" : "content";
}

/** The largest whole pixel size whose estimated lines fit the box, never under `minPx`. */
export function fitFontPx(input: {
  readonly texts: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly maxPx: number;
  readonly minPx: number;
  readonly lineHeight: number;
}): number {
  for (let px = input.maxPx; px >= input.minPx; px -= 1) {
    const lines = input.texts.reduce(
      (sum, text) =>
        sum +
        Math.ceil((text.length * px * AVERAGE_CHARACTER_EM) / input.width),
      0
    );

    if (lines * px * input.lineHeight <= input.height) return px;
  }

  return input.minPx;
}

/** The default size of a title, text or bullet list in its frame's box. */
export function defaultTextPx(
  kind: "title" | "text" | "bullets",
  frame: FrameName,
  _region: Region,
  texts: readonly string[],
  box: Box
): number {
  if (kind === "title") {
    return fitFontPx({
      texts,
      width: box.w,
      height: box.h,
      maxPx: TITLE_PX[frame],
      minPx: 20,
      lineHeight: LINE_HEIGHT.title,
    });
  }

  return fitFontPx({
    texts,
    width: kind === "bullets" ? box.w - 20 : box.w,
    height: box.h,
    maxPx: frame === "split" ? LOOK_PX.panelText : LOOK_PX.fullText,
    minPx: 12,
    lineHeight: LINE_HEIGHT.text,
  });
}

/** Each bullet list item's circle and text box, the block centered in its box. */
export function listItemBoxes(
  count: number,
  box: Box
): readonly { readonly circle: Box; readonly text: Box }[] {
  const block = count * LIST_ITEM_H + (count - 1) * LIST_ITEM_GAP;
  const top = box.y + Math.round((box.h - block) / 2);

  return Array.from({ length: count }, (_, index) => {
    const y = top + index * LIST_ITEM_STEP;

    return {
      circle: { x: box.x, y, w: LIST_CIRCLE, h: LIST_CIRCLE },
      text: {
        x: box.x + LIST_TEXT_X,
        y,
        w: box.w - LIST_TEXT_X,
        h: LIST_ITEM_H,
      },
    };
  });
}

type FigureBoxes = {
  readonly rule: Box | null;
  readonly number: Box;
  readonly label: Box;
  readonly caption: Box;
};

/** A figure or table's rule, number, label and caption, stacked from the top and centered. */
export function figureBoxes(
  box: Box,
  numberPx: number,
  paired: boolean
): FigureBoxes {
  const lead = paired ? FIGURE_RULE_H + FIGURE_RULE_GAP : 0;

  const block =
    lead +
    numberPx +
    FIGURE_NUMBER_GAP +
    FIGURE_LABEL_H +
    FIGURE_LABEL_GAP +
    FIGURE_CAPTION_H;

  const top = box.y + Math.round((box.h - block) / 2);
  const numberY = top + lead;
  const labelY = numberY + numberPx + FIGURE_NUMBER_GAP;
  const captionY = labelY + FIGURE_LABEL_H + FIGURE_LABEL_GAP;

  return {
    rule: paired ? { x: box.x, y: top, w: box.w, h: FIGURE_RULE_H } : null,
    number: { x: box.x, y: numberY, w: box.w, h: numberPx },
    label: { x: box.x, y: labelY, w: box.w, h: FIGURE_LABEL_H },
    caption: { x: box.x, y: captionY, w: box.w, h: FIGURE_CAPTION_H },
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

type PaletteSlide = {
  readonly background?: string | undefined;
  readonly elements: readonly { readonly style?: ElementStyle | undefined }[];
};

/**
 * A slide with a background or a colored element draws on the light palette under its own values,
 * so the pair on screen is the pair the save checked, in the dark theme too (P13-3).
 */
export function usesLightPalette(slide: PaletteSlide): boolean {
  return (
    slide.background !== undefined ||
    slide.elements.some(
      ({ style }) => style?.color !== undefined || style?.fill !== undefined
    )
  );
}

/**
 * The footer's text color: the readable one on a background, the theme text on another light-palette
 * slide, none for the theme's muted gray (P13-7). The caller passes core's `foregroundFor`, because
 * the server loads this file and core's branding entry also exports a client component.
 */
export function footerColor(
  slide: PaletteSlide,
  foregroundOf: (background: string) => string
): string | undefined {
  if (slide.background !== undefined) return foregroundOf(slide.background);

  return usesLightPalette(slide) ? THEME_TEXT : undefined;
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
