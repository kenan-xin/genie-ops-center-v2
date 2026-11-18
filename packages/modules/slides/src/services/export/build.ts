import type { FetchedFile } from "@genie/core";
import { foregroundFor } from "@genie/core";
import {
  chartCaption,
  type ChartData,
  formatChartValue,
} from "@genie/ui/chart-data";
import { imageSize } from "image-size";
import pptxgenjs from "pptxgenjs";

import type { ElementStyle, SlideTheme } from "../../contract.ts";
import {
  type Box,
  CANVAS,
  comparisonMax,
  drawnStyle,
  figureBoxes,
  figureNumber,
  figuresDate,
  footerText,
  FRAME_PADDING,
  isPrioritiesList,
  isSecondVisual,
  LINE_HEIGHT,
  listItemBoxes,
  LOOK_PX,
  PANEL_W,
  placedBoxes,
  slideChartColors,
  slideFooterColor,
  slideFrame,
  textGround,
  textPx,
  TYPE_PX,
  visualGround,
  visualLook,
} from "../../presentation/slide-layout.ts";
import type { ShownElement, ShownSlide } from "../../presentation/views.ts";
import { dropMissingOverrides } from "./content-types.ts";
import { pptxChartOf } from "./pptx-chart.ts";

// The typings are read as CommonJS (no `"type"` in its package.json), so TypeScript puts the class
// at `.default` of the default import, while the ESM build Node loads answers the class itself.
// The check takes whichever form the loader gave.
const PptxGenJS: typeof pptxgenjs.default =
  "default" in pptxgenjs ? pptxgenjs.default : pptxgenjs;

type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

type ChartOptions = NonNullable<Parameters<Slide["addChart"]>[2]>;

const MASTER = "GENIE";

const HIDDEN = "You can no longer read the data of this chart.";

/** Canvas pixels of the source row under a chart or table, and of a table's title row (`gap-1`). */
const CAPTION_PX = 20;

const TABLE_TITLE_PX = 24;

/** The screen's table rows: 13 px x 1.25 + 2 x 5.6, 15 x 1.25 + 2 x 7, 13 x 1.25 + 2 x 3.75, 12 x 1.25 + 2 x 1.9. */
const TABLE_ROW_PX = { header: 28, row: 33, dense: 24, compact: 19 } as const;

/** `SlideTable` draws dense rows from 10 rows. */
const DENSE_ROWS = 10;

/** The footer row: "Figures as of 27 Oct 2026" at the left; the logo and the name at the right (490 - 180 - 88). */
const FIGURES_W = 180;

const LOGO = { w: 80, h: 20, gap: 8 };

const NAME_W = 222;

/** The image types pptxgenjs embeds in Node; an SVG needs a PNG it can only draw in a browser. */
const EMBEDDABLE: ReadonlySet<string> = new Set(["image/png", "image/jpeg"]);

/** Canvas pixels to inches: the 960 x 540 canvas is the 10 x 5.625 in 16:9 slide (D10). */
const inches = (box: Box) => ({
  x: box.x / 96,
  y: box.y / 96,
  w: box.w / 96,
  h: box.h / 96,
});

const points = (px: number) => px * 0.75;

const hex = (color: string) => color.replace("#", "");

type Border =
  | { readonly type: "none" }
  | { readonly type: "solid"; readonly pt: number; readonly color: string };

const inset = (box: Box, by: number): Box => ({
  x: box.x + by,
  y: box.y + by,
  w: box.w - 2 * by,
  h: box.h - 2 * by,
});

/** An element's fill or border, as a rectangle under it; none without either. */
function addFrame(
  slide: Slide,
  rect: Parameters<Slide["addShape"]>[0],
  box: Box,
  style: ElementStyle | undefined
): boolean {
  const border =
    style?.border !== undefined && style.border.width > 0
      ? style.border
      : undefined;

  if (style?.fill === undefined && border === undefined) return false;

  slide.addShape(rect, {
    ...inches(box),
    fill:
      style?.fill === undefined ? { type: "none" } : { color: hex(style.fill) },
    line:
      border === undefined
        ? { type: "none" }
        : { color: hex(border.color), width: points(border.width) },
  });

  return true;
}

const isData = (kind: ShownElement["kind"]) =>
  kind === "figure" || kind === "chart" || kind === "table";

/** An image fitted into the box with its own aspect ratio, as `object-contain` on screen. */
function containedImage(image: FetchedFile, box: Box) {
  const { width = 1, height = 1 } = imageSize(image.bytes);
  const at = inches(box);

  return {
    data: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
    x: at.x,
    y: at.y,
    w: at.w,
    h: (at.w * height) / width,
    sizing: { type: "contain" as const, w: at.w, h: at.h },
  };
}

/** PowerPoint's cell borders are top, right, bottom, left; a row has only its bottom rule. */
const underline = (
  pt: number,
  color: string
): [Border, Border, Border, Border] => [
  { type: "none" },
  { type: "none" },
  { type: "solid", pt, color },
  { type: "none" },
];

/** A number or an amount aligns right, as on screen. */
const align = (column: ChartData["columns"][number]) =>
  column.type === "number" || column.type === "money"
    ? ("right" as const)
    : ("left" as const);

/** A table at the slide table sizes, centered in its area as the screen's `my-auto`, under its title row. */
function addTable(
  slide: Slide,
  data: ChartData,
  inner: Box,
  options: {
    readonly fontFace: string;
    readonly theme: SlideTheme;
    readonly fullText: boolean;
  }
): void {
  const { fontFace, theme, fullText } = options;

  const dense = data.rows.length >= DENSE_ROWS;

  slide.addText(data.title, {
    ...inches({ ...inner, h: TABLE_TITLE_PX }),
    fontFace,
    fontSize: points(TYPE_PX.label),
    bold: true,
    color: hex(theme.text),
    margin: 0,
    valign: "top",
  });

  const header = data.columns.map((column) => ({
    text: column.label,
    options: {
      bold: true,
      color: hex(theme.secondaryText),
      fontSize: points(fullText ? LOOK_PX.tableHeader : LOOK_PX.caption),
      align: align(column),
      border: underline(points(1.5), hex(theme.text)),
    },
  }));

  const rows = data.rows.map((row) =>
    data.columns.map((column) => ({
      text: formatChartValue(column, row[column.key] ?? null, { row }),
      options: {
        color: hex(theme.text),
        fontSize: points(
          !fullText
            ? LOOK_PX.caption
            : dense
              ? LOOK_PX.denseTable
              : LOOK_PX.table
        ),
        align: align(column),
        border: underline(0.75, hex(theme.hairline)),
      },
    }))
  );

  const heights = [
    fullText ? TABLE_ROW_PX.header : TABLE_ROW_PX.compact,
    ...rows.map(() =>
      !fullText
        ? TABLE_ROW_PX.compact
        : dense
          ? TABLE_ROW_PX.dense
          : TABLE_ROW_PX.row
    ),
  ];

  const total = heights.reduce((sum, h) => sum + h, 0);

  const area = {
    ...inner,
    y: inner.y + TABLE_TITLE_PX,
    h: inner.h - TABLE_TITLE_PX - CAPTION_PX,
  };

  slide.addTable([header, ...rows], {
    ...inches({
      ...area,
      y: area.y + Math.max(0, (area.h - total) / 2),
      h: total,
    }),
    fontFace,
    rowH: heights.map((h) => h / 96),
    valign: "middle",
    autoPage: false,
  });
}

/**
 * The deck as a PowerPoint file with native, editable charts (R-55, D8). Every frame, box, color
 * and size comes from the screen's helpers in `slide-layout.ts`, so PowerPoint draws the slide the
 * canvas draws (D10, czjw.183). A data element the caller can no longer read is the refusal line,
 * with no figure and no source (D15). It writes no file: the answer is the bytes, for `FileStorage`.
 */
export async function buildDeckPptx(input: {
  readonly title: string;
  readonly slides: readonly ShownSlide[];
  readonly figuresAsOf: string;
  readonly timeZone: string;
  readonly theme: SlideTheme;
  readonly logo: FetchedFile | null;
  readonly images: ReadonlyMap<string, FetchedFile>;
}): Promise<Buffer> {
  const { theme, timeZone } = input;
  const { fontFace } = theme;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";
  pptx.title = input.title;
  pptx.company = theme.companyName;
  pptx.theme = { headFontFace: fontFace, bodyFontFace: fontFace };
  pptx.defineSlideMaster({ title: MASTER });

  const logo =
    input.logo !== null && EMBEDDABLE.has(input.logo.mimeType)
      ? input.logo
      : null;

  const solid = theme.layout === "solid";
  const rect = pptx.ShapeType.rect;

  for (const [at, shown] of input.slides.entries()) {
    const slide = pptx.addSlide({ masterName: MASTER });
    const first = at === 0;
    const kinds = shown.elements.map(({ kind }) => kind);
    const frame = slideFrame(kinds, first);
    const boxes = placedBoxes(shown.elements, first);
    const full = frame.name !== "split";
    const valueMax = comparisonMax(shown.elements);

    slide.background = { color: hex(shown.background ?? theme.background) };

    if (shown.notes !== undefined) {
      slide.addNotes(shown.notes);
    }

    // A solid panel is a fill; a light split panel is a line at its edge; a light full frame has none.
    if (solid) {
      slide.addShape(rect, {
        ...inches(frame.panel),
        fill: {
          color: hex(full ? (shown.background ?? theme.panel) : theme.panel),
        },
        line: { type: "none" },
      });
    } else if (!full) {
      slide.addShape(pptx.ShapeType.line, {
        ...inches({ x: PANEL_W, y: 0, w: 0, h: CANVAS.height }),
        line: { color: hex(theme.panel), width: 0.75 },
      });
    }

    if (frame.ring !== null) {
      const width = solid ? 12 : 3;

      // CSS draws the border inside the box; PowerPoint centers a line on its path.
      slide.addShape(pptx.ShapeType.ellipse, {
        ...inches(inset(frame.ring, width / 2)),
        fill: { type: "none" },
        line: { color: hex(theme.ring), width: points(width) },
      });
    }

    const text = (index: number) => ({
      fontFace,
      color: hex(textGround(shown, index, theme, first).color),
    });

    const head = shown.elements[0];

    if (head?.kind === "title") {
      const framed = addFrame(slide, rect, boxes.title, head.style);

      slide.addText(head.text, {
        ...inches(boxes.title),
        ...text(0),
        fontSize: points(textPx(head, boxes.title, frame.name, false)),
        // PowerPoint has bold or not; semibold draws bold.
        bold: (head.style?.weight ?? theme.weight) !== "regular",
        lineSpacingMultiple: LINE_HEIGHT.title,
        valign: "bottom",
        align: head.style?.align ?? "left",
        margin: framed ? points(FRAME_PADDING) : 0,
      });
    }

    for (const { index, box } of boxes.body) {
      const element = shown.elements[index];

      if (element === undefined) continue;

      const drawn = drawnStyle(
        element.kind,
        element.style,
        visualGround(box, frame.name, theme, shown.background),
        theme.background
      );

      const framed = addFrame(slide, rect, box, drawn);

      const border =
        drawn?.border !== undefined && drawn.border.width > 0
          ? drawn.border.width
          : 0;

      // A frame's content sits inside its padding and border, as on screen; text kinds take it as margin.
      const inner = framed ? inset(box, FRAME_PADDING + border) : box;

      const textOptions = {
        ...text(index),
        bold:
          element.style?.weight !== undefined &&
          element.style.weight !== "regular",
        align: element.style?.align ?? ("left" as const),
        margin: framed ? points(FRAME_PADDING) : 0,
        valign: "top" as const,
      };

      if ("hidden" in element) {
        slide.addText(HIDDEN, {
          ...inches(inner),
          fontFace,
          fontSize: points(TYPE_PX.text),
          color: hex(theme.text),
          valign: "top",
          margin: 0,
        });
      } else if (element.kind === "text") {
        slide.addText(element.text, {
          ...inches(box),
          ...textOptions,
          fontSize: points(textPx(element, box, frame.name, false)),
          lineSpacingMultiple: LINE_HEIGHT.text,
        });
      } else if (element.kind === "bullets") {
        const priorities = isPrioritiesList(kinds, index, box, frame.name);
        const fontSize = points(textPx(element, box, frame.name, priorities));

        if (!priorities) {
          slide.addText(
            element.items.map((item) => ({
              text: item,
              options: { bullet: true, breakLine: true },
            })),
            {
              ...inches(box),
              ...textOptions,
              fontSize,
              lineSpacingMultiple: LINE_HEIGHT.text,
            }
          );
          continue;
        }

        for (const [n, slot] of listItemBoxes(
          element.items.length,
          box
        ).entries()) {
          slide.addShape(pptx.ShapeType.ellipse, {
            ...inches(slot.circle),
            ...(solid
              ? { fill: { color: hex(theme.accent) }, line: { type: "none" } }
              : {
                  fill: { type: "none" },
                  line: { color: hex(theme.accent), width: points(1.5) },
                }),
          });
          slide.addText(String(n + 1), {
            ...inches(slot.circle),
            fontFace,
            fontSize: points(LOOK_PX.listNumber),
            bold: true,
            align: "center",
            valign: "middle",
            color: hex(solid ? theme.accentText : theme.accent),
            margin: 0,
          });
          slide.addText(element.items[n] ?? "", {
            ...inches(slot.text),
            ...textOptions,
            fontSize,
            lineSpacingMultiple: LINE_HEIGHT.list,
            margin: 0,
          });
        }
      } else if (element.kind === "image") {
        const image = input.images.get(element.fileId);

        if (image !== undefined) {
          slide.addImage({
            ...containedImage(image, inner),
            altText: element.alt,
          });
        }
      } else if (element.kind === "figure") {
        const { data } = element;
        const { paired } = visualLook(shown.elements, index);
        const second = isSecondVisual(shown.elements, index);
        const { number, code, px } = figureNumber(data, inner, paired);
        const parts = figureBoxes(inner, px, paired);

        if (parts.rule !== null) {
          slide.addShape(rect, {
            ...inches(parts.rule),
            fill: { color: hex(second ? theme.rule : theme.accent) },
            line: { type: "none" },
          });
        }

        slide.addText(
          [
            ...(code === ""
              ? []
              : [
                  {
                    text: `${code} `,
                    options: { superscript: true, fontSize: points(px * 0.36) },
                  },
                ]),
            { text: number },
          ],
          {
            ...inches(parts.number),
            fontFace,
            fontSize: points(px),
            bold: theme.weight === "bold",
            color: hex(second ? theme.text : theme.accent),
            margin: 0,
            valign: "middle",
            wrap: false,
          }
        );
        // The label and the source flow down from the label's place, as on screen (P14-51).
        slide.addText(
          [
            {
              text: data.title,
              options: {
                bold: true,
                fontSize: points(LOOK_PX.figureLabel),
                breakLine: true,
              },
            },
            {
              text: chartCaption(data, timeZone),
              options: { fontSize: points(LOOK_PX.caption) },
            },
          ],
          {
            ...inches({
              ...parts.label,
              h: inner.y + inner.h - parts.label.y,
            }),
            fontFace,
            color: hex(theme.secondaryText),
            lineSpacingMultiple: LINE_HEIGHT.text,
            valign: "top",
            margin: 0,
          }
        );
      } else if ("data" in element) {
        const { data } = element;
        const look = visualLook(shown.elements, index);

        if (element.kind === "chart") {
          const chart = pptxChartOf(data, valueMax);

          const colors = slideChartColors(
            theme,
            isSecondVisual(shown.elements, index)
          ).map(hex);

          const options: ChartOptions = {
            ...inches({ ...inner, h: inner.h - CAPTION_PX }),
            title: data.title,
            showTitle: !look.titleHidden,
            titleFontFace: fontFace,
            titleFontSize: points(TYPE_PX.text),
            titleColor: hex(theme.text),
            // A donut names its parts only in the legend.
            showLegend: chart.series.length >= 2 || chart.type === "doughnut",
            legendPos: "t",
            legendFontFace: fontFace,
            legendFontSize: points(TYPE_PX.label),
            legendColor: hex(theme.secondaryText),
            catAxisLabelFontFace: fontFace,
            catAxisLabelFontSize: points(TYPE_PX.label),
            catAxisLabelColor: hex(theme.secondaryText),
            valAxisLabelFontFace: fontFace,
            valAxisLabelFontSize: points(TYPE_PX.label),
            valAxisLabelColor: hex(theme.secondaryText),
            valAxisLabelFormatCode: chart.formatCode,
            dataLabelFormatCode: chart.formatCode,
            valGridLine: { color: hex(theme.hairline), size: 0.75 },
            catGridLine: { style: "none" },
            catAxisLineShow: false,
            valAxisLineShow: false,
            plotArea: { fill: { color: hex(theme.background) } },
            chartArea: { fill: { color: hex(theme.background) } },
            lineSize: 2.25,
            // A donut colors each part; a bar with more colors than series would color each bar.
            chartColors:
              chart.type === "doughnut"
                ? [...colors]
                : colors.slice(0, chart.series.length),
            // A missing value is a gap, never 0 (R-7).
            displayBlanksAs: "gap",
          };

          // The shared axis is the screen's [0, max]; a lone max lets a renderer step below 0.
          if (chart.valueMax !== undefined) {
            options.valAxisMinVal = 0;
            options.valAxisMaxVal = chart.valueMax;
          }

          slide.addChart(
            chart.type,
            chart.series.map((series) => ({
              name: series.name,
              labels: [...series.labels],
              values: [...series.values],
            })),
            options
          );
        } else {
          addTable(slide, data, inner, {
            fontFace,
            theme,
            fullText: look.fullText,
          });
        }

        slide.addText(chartCaption(data, timeZone), {
          ...inches({
            ...inner,
            y: inner.y + inner.h - CAPTION_PX,
            h: CAPTION_PX,
          }),
          fontFace,
          fontSize: points(LOOK_PX.caption),
          color: hex(theme.secondaryText),
          margin: 0,
        });
      }
    }

    const { footer } = frame;

    if (footer === null) continue;

    // The footer takes the screen's footer color, so it stays legible on a slide background (P13-7).
    const footerOptions = {
      fontFace,
      fontSize: points(LOOK_PX.footer),
      color: hex(slideFooterColor(theme, shown.background, foregroundFor)),
      margin: 0,
      valign: "middle" as const,
    };

    const name = { ...footer, x: footer.x + footer.w - NAME_W, w: NAME_W };

    if (kinds.some(isData)) {
      slide.addText(`Figures as of ${figuresDate(input.figuresAsOf)}`, {
        ...inches({ ...footer, w: FIGURES_W }),
        ...footerOptions,
      });
    }

    if (logo !== null) {
      slide.addImage(
        containedImage(logo, {
          x: name.x - LOGO.gap - LOGO.w,
          y: footer.y + (footer.h - LOGO.h) / 2,
          w: LOGO.w,
          h: LOGO.h,
        })
      );
    }

    slide.addText(
      footerText(theme, { index: at, count: input.slides.length }),
      {
        ...inches(name),
        ...footerOptions,
        align: "right",
      }
    );
  }

  const bytes = await pptx.write({
    outputType: "nodebuffer",
    compression: true,
  });

  if (!Buffer.isBuffer(bytes)) {
    throw new Error("pptxgenjs answered no Node buffer.");
  }

  return dropMissingOverrides(bytes);
}
