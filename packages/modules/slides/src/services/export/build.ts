import type { FetchedFile } from "@genie/core";
import { foregroundFor } from "@genie/core";
import {
  chartCaption,
  type ChartData,
  formatChartValue,
} from "@genie/ui/chart-data";
import { chartColors } from "@genie/ui/tokens";
import { imageSize } from "image-size";
import pptxgenjs from "pptxgenjs";

import { type ElementStyle, THEME_TEXT } from "../../contract.ts";
import {
  type Box,
  drawnStyle,
  elementBoxes,
  figuresDate,
  FRAME_PADDING,
  slideLayout,
  TYPE_PX,
} from "../../presentation/slide-layout.ts";
import type { ShownElement, ShownSlide } from "../../presentation/views.ts";
import type { DeckTheme } from "../decks/theme.ts";
import { dropMissingOverrides } from "./content-types.ts";
import { pptxChartOf } from "./pptx-chart.ts";

// The typings are read as CommonJS (no `"type"` in its package.json), so TypeScript puts the class
// at `.default` of the default import, while the ESM build Node loads answers the class itself.
// The check takes whichever form the loader gave.
const PptxGenJS: typeof pptxgenjs.default =
  "default" in pptxgenjs ? pptxgenjs.default : pptxgenjs;

type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

const MASTER = "GENIE";

const HIDDEN = "You can no longer read the data of this chart.";

/** The text colors of the light theme, as PowerPoint hex. */
const TEXT = THEME_TEXT.replace("#", "");

const MUTED = "6B7280";

const BORDER = "D1D5DB";

/** Canvas pixels of the caption under a data element, and of a KPI's value and title rows. */
const CAPTION_PX = 20;

const KPI_VALUE_PX = 48;

const KPI_TITLE_PX = 28;

/** The footer row, right to left: the slide number, the company name, the logo (as on screen). */
const NUMBER_W = 40;

const NAME_W = 272;

const LOGO = { w: 80, h: 20, gap: 8 };

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

/** The text options of a title, text or bullet list, from its style over the theme's defaults. */
function textStyle(
  style: ElementStyle | undefined,
  defaults: { readonly px: number; readonly bold: boolean },
  framed: boolean
) {
  return {
    color: style?.color === undefined ? TEXT : hex(style.color),
    fontSize: points(style?.fontSize ?? defaults.px),
    // PowerPoint has bold or not; semibold draws bold.
    bold:
      style?.weight === undefined ? defaults.bold : style.weight !== "regular",
    align: style?.align ?? ("left" as const),
    margin: framed ? points(FRAME_PADDING) : 0,
  };
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

function addData(
  slide: Slide,
  kind: "figure" | "chart" | "table",
  data: ChartData,
  box: Box,
  font: { readonly fontFace: string; readonly timeZone: string }
): void {
  const visual = { ...box, h: box.h - CAPTION_PX };
  const { fontFace } = font;

  if (kind === "figure") {
    const [column] = data.columns;
    const row = data.rows[0] ?? {};

    slide.addText(
      column === undefined
        ? ""
        : formatChartValue(column, row[column.key] ?? null, { row }),
      {
        ...inches({ ...visual, h: KPI_VALUE_PX }),
        fontFace,
        fontSize: points(TYPE_PX.figure),
        bold: true,
        color: TEXT,
        margin: 0,
      }
    );
    slide.addText(data.title, {
      ...inches({ ...visual, y: visual.y + KPI_VALUE_PX, h: KPI_TITLE_PX }),
      fontFace,
      fontSize: points(TYPE_PX.text),
      color: MUTED,
      margin: 0,
    });
  } else if (kind === "table") {
    slide.addTable(
      [
        data.columns.map((column) => ({
          text: column.label,
          options: { bold: true },
        })),
        ...data.rows.map((row) =>
          data.columns.map((column) => ({
            text: formatChartValue(column, row[column.key] ?? null, { row }),
          }))
        ),
      ],
      {
        ...inches(visual),
        fontFace,
        fontSize: points(TYPE_PX.caption),
        color: TEXT,
        border: { type: "solid", pt: 0.5, color: BORDER },
        autoPage: false,
      }
    );
  } else {
    const chart = pptxChartOf(data);
    const colors = chartColors.light.map(hex);

    slide.addChart(
      chart.type,
      chart.series.map((series) => ({
        name: series.name,
        labels: [...series.labels],
        values: [...series.values],
      })),
      {
        ...inches(visual),
        title: data.title,
        showTitle: true,
        titleFontFace: fontFace,
        titleFontSize: points(TYPE_PX.text),
        titleColor: TEXT,
        // A donut names its parts only in the legend.
        showLegend: chart.series.length >= 2 || chart.type === "doughnut",
        legendPos: "b",
        legendFontFace: fontFace,
        legendFontSize: points(TYPE_PX.label),
        catAxisLabelFontFace: fontFace,
        catAxisLabelFontSize: points(TYPE_PX.label),
        valAxisLabelFontFace: fontFace,
        valAxisLabelFontSize: points(TYPE_PX.label),
        valAxisLabelFormatCode: chart.formatCode,
        dataLabelFormatCode: chart.formatCode,
        // A donut colors each part; a bar with more colors than series would color each bar.
        chartColors:
          chart.type === "doughnut"
            ? colors
            : colors.slice(0, chart.series.length),
        // A missing value is a gap, never 0 (R-7).
        displayBlanksAs: "gap",
      }
    );
  }

  slide.addText(chartCaption(data, font.timeZone), {
    ...inches({ ...box, y: box.y + box.h - CAPTION_PX, h: CAPTION_PX }),
    fontFace,
    fontSize: points(TYPE_PX.caption),
    color: MUTED,
    margin: 0,
  });
}

/**
 * The deck as a PowerPoint file with native, editable charts (R-55, D8). Every box comes from the
 * screen's `slideLayout`, so PowerPoint draws the same slide (D10). A data element the caller can
 * no longer read is the refusal line, with no figure and no source (D15). It writes no file:
 * the answer is the bytes, for `FileStorage`.
 */
export async function buildDeckPptx(input: {
  readonly title: string;
  readonly slides: readonly ShownSlide[];
  readonly figuresAsOf: string;
  readonly timeZone: string;
  readonly theme: DeckTheme;
  readonly logo: FetchedFile | null;
  readonly images: ReadonlyMap<string, FetchedFile>;
}): Promise<Buffer> {
  const { theme } = input;
  const { fontFace } = theme;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";
  pptx.title = input.title;
  pptx.company = theme.companyName;
  pptx.theme = { headFontFace: fontFace, bodyFontFace: fontFace };

  // The layout's footer is the same on every slide.
  const { footer } = slideLayout(["title"]);

  const footerText = {
    fontFace,
    fontSize: points(TYPE_PX.footer),
    color: MUTED,
  };

  const nameX = footer.x + footer.w - NUMBER_W - NAME_W;

  const logoBox = {
    x: nameX - LOGO.gap - LOGO.w,
    y: footer.y + (footer.h - LOGO.h) / 2,
    w: LOGO.w,
    h: LOGO.h,
  };

  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: "FFFFFF" },
    slideNumber: {
      ...inches({ ...footer, x: footer.x + footer.w - NUMBER_W, w: NUMBER_W }),
      ...footerText,
      align: "right",
    },
    objects: [
      {
        text: {
          text: theme.companyName,
          options: {
            ...inches({ ...footer, x: nameX, w: NAME_W }),
            ...footerText,
            align: "right",
            margin: 0,
          },
        },
      },
      ...(input.logo !== null && EMBEDDABLE.has(input.logo.mimeType)
        ? [{ image: containedImage(input.logo, logoBox) }]
        : []),
    ],
  });

  for (const shown of input.slides) {
    const slide = pptx.addSlide({ masterName: MASTER });
    const kinds = shown.elements.map(({ kind }) => kind);
    const layout = slideLayout(kinds);
    const boxes = elementBoxes(shown.elements);
    const [first] = shown.elements;
    const rect = pptx.ShapeType.rect;

    if (shown.background !== undefined) {
      slide.background = { color: hex(shown.background) };
    }

    const titleStyle = first?.style;

    slide.addText(first?.kind === "title" ? first.text : "", {
      ...inches(boxes.title),
      fontFace,
      ...textStyle(
        titleStyle,
        { px: TYPE_PX.title, bold: true },
        addFrame(slide, rect, boxes.title, titleStyle)
      ),
      valign: "top",
    });
    slide.addShape(rect, {
      ...inches(layout.rule),
      fill: { color: hex(theme.primaryColor) },
      line: { color: hex(theme.primaryColor) },
    });

    for (const { index, box } of boxes.body) {
      const element = shown.elements[index];

      if (element === undefined) continue;

      const framed = addFrame(
        slide,
        rect,
        box,
        drawnStyle(element.kind, element.style, shown.background)
      );

      if ("hidden" in element) {
        slide.addText(HIDDEN, {
          ...inches(box),
          fontFace,
          fontSize: points(TYPE_PX.text),
          color: TEXT,
          valign: "top",
          margin: 0,
        });
      } else if (element.kind === "text") {
        slide.addText(element.text, {
          ...inches(box),
          fontFace,
          ...textStyle(
            element.style,
            { px: TYPE_PX.text, bold: false },
            framed
          ),
          valign: "top",
        });
      } else if (element.kind === "bullets") {
        slide.addText(
          element.items.map((text) => ({
            text,
            options: { bullet: true, breakLine: true },
          })),
          {
            ...inches(box),
            fontFace,
            ...textStyle(
              element.style,
              { px: TYPE_PX.bullet, bold: false },
              framed
            ),
            valign: "middle",
          }
        );
      } else if (element.kind === "image") {
        const image = input.images.get(element.fileId);

        if (image !== undefined) {
          slide.addImage({
            ...containedImage(image, box),
            altText: element.alt,
          });
        }
      } else if ("data" in element) {
        addData(slide, element.kind, element.data, box, {
          fontFace,
          timeZone: input.timeZone,
        });
      }
    }

    if (kinds.some(isData)) {
      slide.addText(`Figures as of ${figuresDate(input.figuresAsOf)}`, {
        ...inches({ ...footer, w: logoBox.x - footer.x - LOGO.gap }),
        ...footerText,
        // On a slide background the muted gray can vanish; the one foreground rule keeps it read.
        color:
          shown.background === undefined
            ? footerText.color
            : hex(foregroundFor(shown.background)),
        margin: 0,
      });
    }
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
