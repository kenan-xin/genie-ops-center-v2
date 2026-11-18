import { contrastRatio } from "@genie/core/features/branding";
import type { ChartData } from "@genie/ui";
import {
  currencyDigits,
  formatChartValue,
  niceAxis,
} from "@genie/ui/chart-data";
import { chartColors } from "@genie/ui/tokens";
import { truncate } from "es-toolkit/compat";
import type { CSSProperties } from "react";

import type { Placement, StoredElement } from "../content.ts";
import {
  type ElementBox,
  type ElementKind,
  type ElementStyle,
  SLIDE_CANVAS,
  type SlideTheme,
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

/** A style object of CSS custom properties only; the classes read them. */
export type CssVars = CSSProperties & {
  readonly [key: `--${string}`]: string | number;
};

/** Joins the classes that apply; the lists here set no two classes of one property. */
export const cn = (...classes: readonly (string | false | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/** The classes that place a box from its `--box-*` variables. */
export const PLACED =
  "absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w)";

export const boxVars = (box: Box): CssVars => ({
  "--box-x": `${box.x}px`,
  "--box-y": `${box.y}px`,
  "--box-w": `${box.w}px`,
  "--box-h": `${box.h}px`,
});

/** The classes and variables of a frame part at its box; spread like `boxProps`. */
export const placed = (box: Box, className: string) => ({
  style: boxVars(box),
  className: cn(PLACED, className),
});

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

/** Whichever of white and the theme text has more contrast on `behind`, as uppercase hex. */
export function readableOn(behind: string): string {
  return contrastRatio(THEME_TEXT, behind) >= contrastRatio("#FFFFFF", behind)
    ? THEME_TEXT
    : "#FFFFFF";
}

const BODY_KINDS: ReadonlySet<ElementKind> = new Set(["text", "bullets"]);

const VISUAL_KINDS: ReadonlySet<ElementKind> = new Set([
  "figure",
  "chart",
  "table",
  "image",
]);

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
  chart: { x: 432, y: 117, w: 480, h: 288 }, // 45cqw, 12.2cqw, 50cqw, 30cqw
  visual: { x: 432, y: 58, w: 480, h: 405 }, // 45cqw, 6cqw, 50cqw, 42.2cqw
  pairChart: { x: 432, y: 115, w: 225, h: 292 }, // 45cqw, 12cqw, 23.4cqw, 72% of the content height
  pairVisual: { x: 432, y: 58, w: 225, h: 405 }, // 45cqw, 6cqw, 23.4cqw, 42.2cqw
  footer: { x: 422, y: 488, w: 490, h: 24 }, // 44cqw, 3cqw from the bottom, 51cqw, 2.5cqw
} as const;

/**
 * The title frame: the ring is 14cqw at 7cqw. `text` is the most room a subtitle takes; `placedBoxes`
 * stacks the subtitle and the title from its foot (P14-53).
 */
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

    if (visuals === 1 || kind === "table") {
      body.push({
        index,
        box: visuals === 1 && kind === "chart" ? SPLIT.chart : SPLIT.visual,
      });
    } else if (kinds.includes("table")) {
      // A 5-column table needs about 437 px, so it keeps the content side and its partner takes
      // the panel body slot (T4-FIT, README Limits "a table takes the wide column"; a P14-12 deviation).
      body.push({ index, box: SPLIT.panelBody });
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

/** Where the prototype's title slide stack ends (454), and its gap between title and subtitle (23, 2.4cqw). */
const TITLE_SLIDE_FOOT = TITLE_FRAME.text.y + TITLE_FRAME.text.h;

const TITLE_SLIDE_GAP =
  TITLE_FRAME.text.y - (TITLE_FRAME.title.y + TITLE_FRAME.title.h);

type TitleSlideBoxes = { readonly title: Box; readonly text: Box };

/** Where the statement frame's line ends (453). */
const STATEMENT_FOOT = STATEMENT_FRAME.text.y + STATEMENT_FRAME.text.h;

/** The statement stacked from the frame's top, as the prototype's closing slide: the title as tall as its estimated lines, its line right under it (C14-6). */
function statementBoxes(
  title:
    | {
        readonly text?: string | undefined;
        readonly style?: ElementStyle | undefined;
      }
    | undefined
): TitleSlideBoxes {
  const text = title?.text ?? "";

  const px =
    title?.style?.fontSize ??
    defaultTextPx("title", "statement", "panel", [text], STATEMENT_FRAME.title);

  const h = Math.min(
    STATEMENT_FRAME.title.h,
    Math.ceil(
      linesOf(text, px, STATEMENT_FRAME.title.w) * px * LINE_HEIGHT.title
    )
  );

  const y = STATEMENT_FRAME.title.y + h + TITLE_SLIDE_GAP;

  return {
    title: { ...STATEMENT_FRAME.title, h },
    text: { ...STATEMENT_FRAME.text, y, h: STATEMENT_FOOT - y },
  };
}

/** The title slide stacked from its foot: the subtitle as tall as its estimated lines, the title right above it (P14-53). */
function titleSlideBoxes(
  subtitle:
    | {
        readonly text?: string | undefined;
        readonly style?: ElementStyle | undefined;
      }
    | undefined
): TitleSlideBoxes {
  const text = subtitle?.text;

  if (text === undefined) {
    return {
      title: {
        ...TITLE_FRAME.title,
        h: TITLE_SLIDE_FOOT - TITLE_FRAME.title.y,
      },
      text: TITLE_FRAME.text,
    };
  }

  const px =
    subtitle?.style?.fontSize ??
    defaultTextPx("text", "title", "panel", [text], TITLE_FRAME.text);

  const h = Math.min(
    TITLE_FRAME.text.h,
    Math.ceil(linesOf(text, px, TITLE_FRAME.text.w) * px * LINE_HEIGHT.text)
  );

  const y = TITLE_SLIDE_FOOT - h;

  return {
    title: {
      ...TITLE_FRAME.title,
      h: y - TITLE_SLIDE_GAP - TITLE_FRAME.title.y,
    },
    text: { ...TITLE_FRAME.text, y, h },
  };
}

/** Each element's stored box over its frame box, the title included. */
export function placedBoxes(
  elements: readonly {
    readonly kind: ElementKind;
    readonly box?: ElementBox | undefined;
    readonly text?: string | undefined;
    readonly style?: ElementStyle | undefined;
  }[],
  first: boolean
): Pick<SlideFrame, "name" | "title" | "body"> {
  const frame = slideFrame(
    elements.map(({ kind }) => kind),
    first
  );

  const stacked =
    frame.name === "title"
      ? titleSlideBoxes(elements.find(({ kind }) => kind === "text"))
      : frame.name === "statement"
        ? statementBoxes(elements.find(({ kind }) => kind === "title"))
        : undefined;

  const title =
    elements.find(({ kind }) => kind === "title")?.box ??
    stacked?.title ??
    frame.title;

  return {
    name: frame.name,
    title,
    body: frame.body.map(({ index, box }) => ({
      index,
      box: elements[index]?.box ?? stacked?.text ?? box,
    })),
  };
}

/** A title or statement frame is all panel; a split box is panel when its center is left of the panel. */
export function regionOf(box: Box, frame: FrameName): Region {
  return frame !== "split" || box.x + box.w / 2 < PANEL_W ? "panel" : "content";
}

/** The color behind one text, the color drawn and the color chosen, with the place word of a refusal. */
export type TextGround = {
  readonly behind: string;
  /** What the canvas and the export draw: `chosen`, else the place's color where `chosen` fails the limit (R14-2). */
  readonly color: string;
  /** Its own color, else the place's color: what the save and the style toolbar check. */
  readonly chosen: string;
  readonly defaultColor: string;
  readonly where: "fill" | "panel" | "background";
};

/** What one text of a slide draws on and in: its fill, else the panel or the slide background; its own color, else the theme's color for that place. */
export function textGround(
  slide: {
    readonly background?: string | undefined;
    readonly elements: readonly (Placement & { readonly kind: ElementKind })[];
  },
  index: number,
  theme: Pick<
    SlideTheme,
    "background" | "text" | "panel" | "panelText" | "panelBody" | "layout"
  >,
  first: boolean
): TextGround {
  const element = slide.elements[index];
  const boxes = placedBoxes(slide.elements, first);

  const box =
    element?.kind === "title"
      ? boxes.title
      : boxes.body.find((entry) => entry.index === index)?.box;

  const inPanel = box !== undefined && regionOf(box, boxes.name) === "panel";

  // A title or statement slide with its own background draws the whole slide on it (P14-15).
  const onPanel =
    inPanel &&
    theme.layout === "solid" &&
    (boxes.name === "split" || slide.background === undefined);

  const defaultColor = !inPanel
    ? theme.text
    : element?.kind === "title"
      ? theme.panelText
      : theme.panelBody;

  const fill = element?.style?.fill;
  const kind = element?.kind;

  const isText = kind === "title" || kind === "text" || kind === "bullets";
  const limit = isText ? contrastLimit(kind, element?.style?.fontSize) : 0;

  // A fill with no color keeps the place's color only where it reads on that fill (P14-7).
  const ownColor =
    fill === undefined || contrastRatio(defaultColor, fill) >= limit
      ? defaultColor
      : readableOn(fill);

  const behind =
    fill ?? (onPanel ? theme.panel : (slide.background ?? theme.background));

  const chosen = element?.style?.color ?? ownColor;

  return {
    behind,
    // A stored color picked on another ground is drawn readable, never changed in the store (R14-2).
    color:
      contrastRatio(chosen, behind) >= limit
        ? chosen
        : contrastRatio(ownColor, behind) >= limit
          ? ownColor
          : readableOn(behind),
    chosen,
    defaultColor,
    where: fill !== undefined ? "fill" : onPanel ? "panel" : "background",
  };
}

/** The estimated lines of one text at `px` in `width`. */
const linesOf = (text: string, px: number, width: number) =>
  Math.ceil((text.length * px * AVERAGE_CHARACTER_EM) / width);

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
      (sum, text) => sum + linesOf(text, px, input.width),
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

type FigureNumber = {
  readonly number: string;
  readonly code: string;
  readonly px: number;
};

const WHOLE_UNITS = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/** A figure's number, its currency code, and the largest size that fits the box (P14-16). */
export function figureNumber(
  data: ChartData,
  box: Box,
  paired: boolean
): FigureNumber {
  const column = data.columns[0];
  const row = data.rows[0];

  const value =
    column === undefined || row === undefined
      ? null
      : (row[column.key] ?? null);

  // The column's one currency, or the row's (`currencyKey`).
  const currency =
    column?.type !== "money"
      ? null
      : (column.currency ??
        (column.currencyKey === undefined
          ? null
          : (row?.[column.currencyKey] ?? null)));

  // A sum over no records has no value; the figure says so, as the chart's empty state did. An
  // amount shows whole units, rounded, as the prototype's figures do (C14-4).
  const number =
    value === null || column === undefined || row === undefined
      ? "No data"
      : currency !== null
        ? WHOLE_UNITS.format(
            Number(value) / 10 ** currencyDigits(String(currency))
          )
        : formatChartValue(column, value, { row, bare: true });

  const code = value === null || currency === null ? "" : String(currency);

  const max = paired ? LOOK_PX.pairNumber : LOOK_PX.bigNumber;

  const px = fitFontPx({
    texts: [code + number],
    width: box.w,
    height: max,
    maxPx: max,
    minPx: 24,
    lineHeight: 1,
  });

  return { number, code, px };
}

/** A chart or table title on a slide: `font-semibold` at the 15 px base size and its 1.5 line height. */
const VISUAL_TITLE_PX = TYPE_PX.label;

/** Its line, exact in PowerPoint, whose line multiple scales the font's own line height. */
export const VISUAL_TITLE_LINE_PX = VISUAL_TITLE_PX * 1.5;

/** The unit beside it: `text-xs`, 12 px on a 16 px line. */
const UNIT_LINE_PX = 16;

/** A currency code is capitals, wider than the average letter (`AVERAGE_CHARACTER_EM`). */
const CODE_EM = 0.75;

/** The `gap-2` between the title and the unit, and the `gap-1` under the row. */
const UNIT_GAP = 8;

const ROW_GAP = 4;

export type TitleRow = {
  /** The row with its gap: how far the plot or the table moves down. */
  readonly h: number;
  /** The title's and the unit's text height. */
  readonly text: number;
  readonly titleW: number;
  readonly unitW: number;
  /** The title as drawn: in full, or one line cut with "…" in a stored box, as the screen's `truncate`. */
  readonly label: string;
};

/**
 * A chart or table's title row as the screen draws it (C14-2, C14-7): the title wrapped in full in
 * a frame box and one line in a stored box, the unit at its right, and the gap under the row. A
 * hidden title takes no room; with no unit either, there is no row.
 */
export function titleRow(input: {
  readonly title: string | null;
  readonly unit: string | undefined;
  readonly width: number;
  readonly fullText: boolean;
}): TitleRow {
  const { title, unit, width, fullText } = input;

  const unitW =
    unit === undefined ? 0 : Math.ceil(unit.length * LOOK_PX.caption * CODE_EM);

  const titleW = unit === undefined ? width : width - unitW - UNIT_GAP;

  const lines =
    title === null ? 0 : fullText ? linesOf(title, VISUAL_TITLE_PX, titleW) : 1;

  const text = Math.max(
    Math.ceil(lines * VISUAL_TITLE_LINE_PX),
    unit === undefined ? 0 : UNIT_LINE_PX
  );

  const label =
    title === null || fullText
      ? (title ?? "")
      : truncate(title, {
          length: Math.floor(titleW / (VISUAL_TITLE_PX * AVERAGE_CHARACTER_EM)),
          omission: "…",
        });

  return { h: text === 0 ? 0 : text + ROW_GAP, text, titleW, unitW, label };
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
  background: string | undefined,
  themeBackground: string
): ElementStyle | undefined {
  if (
    background === undefined ||
    style?.fill !== undefined ||
    !THEMED_KINDS.has(kind)
  ) {
    return style;
  }

  return { ...style, fill: themeBackground };
}

/** What a figure, chart or table draws on: the panel on a solid layout's panel, so `drawnStyle` gives it a card; else the slide background (P13-6). */
export function visualGround(
  box: Box,
  frame: FrameName,
  theme: SlideTheme,
  background: string | undefined
): string | undefined {
  return regionOf(box, frame) === "panel" && theme.layout === "solid"
    ? theme.panel
    : background;
}

/** A slide element as the visual helpers read it: a hidden data element comes without `data`. */
type SlideVisual = {
  readonly kind: ElementKind;
  readonly data?: ChartData | undefined;
};

/** The second shown figure or chart of its kind takes the second color (prototype `.two`, comparison `a`). */
export function isSecondVisual(
  elements: readonly SlideVisual[],
  index: number
): boolean {
  const element = elements[index];

  return (
    element?.data !== undefined &&
    elements
      .slice(0, index)
      .filter(({ kind, data }) => kind === element.kind && data !== undefined)
      .length === 1
  );
}

const CARTESIAN: ReadonlySet<string> = new Set(["bar", "line", "area"]);

/** The value-axis top two comparison charts of one measure share, or undefined when each keeps its own (P14-17, P14-45). */
export function comparisonMax(
  elements: readonly SlideVisual[]
): number | undefined {
  const plotted = elements.flatMap(({ kind, data }) =>
    kind === "chart" && data !== undefined && CARTESIAN.has(data.kind)
      ? [data]
      : []
  );

  // One measure only: a sum beside a count, or two currencies, would flatten one chart (P14-45).
  const measures = new Set(
    plotted.flatMap(({ columns }) =>
      columns.map(({ type, currency }) => `${type} ${currency ?? ""}`)
    )
  );

  if (plotted.length !== 2 || measures.size !== 1) return undefined;

  const values = plotted.flatMap(({ rows, columns }) =>
    rows.flatMap((row) => columns.map((column) => Number(row[column.key] ?? 0)))
  );

  // A negative value needs the axis below 0, so those charts keep their own scales.
  // The screen's rounded axis top, so the export's axis matches it (C14-1).
  return Math.min(...values) >= 0 && Math.max(...values) > 0
    ? niceAxis(values).max
    : undefined;
}

/**
 * A chart's eight series colors: the accent and the neutral, then the light palette, so a chart
 * never follows the app's dark mode. The second comparison chart leads with the neutral, so a
 * second series stays apart (P14-51).
 */
export function slideChartColors(
  theme: SlideTheme,
  second: boolean
): readonly string[] {
  return [
    ...(second ? [theme.neutral, theme.accent] : [theme.accent, theme.neutral]),
    ...chartColors.light.slice(2),
  ];
}

const TEXT_KINDS: ReadonlySet<ElementKind> = new Set([
  "title",
  "text",
  "bullets",
]);

/** How many figures, charts, tables and images the slide holds. */
export const visualCount = (kinds: readonly ElementKind[]) =>
  kinds.filter((kind) => !TEXT_KINDS.has(kind)).length;

/** On a split slide with no visual, a bullet list on the content side is the Priorities list. */
export function isPrioritiesList(
  kinds: readonly ElementKind[],
  index: number,
  box: Box,
  frame: FrameName
): boolean {
  return (
    kinds[index] === "bullets" &&
    frame === "split" &&
    visualCount(kinds) === 0 &&
    regionOf(box, frame) === "content"
  );
}

/** How a figure, chart or table draws among the slide's visuals. */
export function visualLook(
  elements: readonly { readonly kind: ElementKind; readonly box?: unknown }[],
  index: number
) {
  const count = visualCount(elements.map(({ kind }) => kind));
  const element = elements[index];

  return {
    paired: count === 2,
    // P14-11: one chart on a slide: the slide's title says what it shows.
    titleHidden: count === 1 && element?.kind === "chart",
    // A frame box has room for the full title and source line; a stored box can be 160 x 96 (P14-25).
    fullText: element?.box === undefined,
  };
}

/** A text element's size: its own, the Priorities list's, or the frame's default for its box. */
export function textPx(
  element: Extract<StoredElement, { kind: "title" | "text" | "bullets" }>,
  box: Box,
  frame: FrameName,
  priorities: boolean
): number {
  if (element.style?.fontSize !== undefined) return element.style.fontSize;

  if (priorities) return LOOK_PX.list;

  return defaultTextPx(
    element.kind,
    frame,
    regionOf(box, frame),
    element.kind === "bullets" ? element.items : [element.text],
    box
  );
}

/**
 * The footer's color on screen and in PowerPoint: the secondary text, or the readable color on a
 * slide background. The caller passes core's `foregroundFor`, because the server loads this file
 * and core's branding entry also exports a client component.
 */
export function slideFooterColor(
  theme: SlideTheme,
  background: string | undefined,
  foregroundOf: (background: string) => string
): string {
  return background === undefined
    ? theme.secondaryText
    : foregroundOf(background);
}

/** The footer's company name and the slide's place, "<company> · <n> / <count>". */
export const footerText = (
  theme: SlideTheme,
  place: { readonly index: number; readonly count: number }
) => `${theme.companyName} · ${place.index + 1} / ${place.count}`;

/** The eight series colors of a chart box, as CSS variables. */
export function chartVars(theme: SlideTheme, second: boolean): CssVars {
  return Object.fromEntries(
    slideChartColors(theme, second).map((color, at) => [
      `--chart-${at + 1}`,
      color,
    ])
  );
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
