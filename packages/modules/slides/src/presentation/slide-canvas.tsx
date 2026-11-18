"use client";

import { foregroundFor } from "@genie/core/features/branding";
import { Chart } from "@genie/ui/chart";
import { useEffect, useRef, useState } from "react";

import type { ElementStyle, SlideTheme } from "../contract.ts";
import { type ImageLinks, keepImageLinks } from "./image-links.ts";
import { SlideFigure } from "./slide-figure.tsx";
import {
  type Box,
  boxVars,
  CANVAS,
  chartVars,
  cn,
  comparisonMax,
  type CssVars,
  FRAME_PADDING,
  isSecondVisual,
  PLACED,
  placed,
  defaultTextPx,
  drawnStyle,
  figuresDate,
  LINE_HEIGHT,
  listItemBoxes,
  LOOK_PX,
  placedBoxes,
  regionOf,
  slideFrame,
  textGround,
  visualGround,
} from "./slide-layout.ts";
import type { ShownElement, ShownSlide } from "./views.ts";

export type SlideCanvasProps = {
  readonly slide: ShownSlide;
  /** The slide's place: the first slide can be the title slide, and the footer shows "<n> / <count>". */
  readonly place: { readonly index: number; readonly count: number };
  readonly figuresAsOf: string;
  readonly timeZone: string;
  readonly theme: SlideTheme;
  /** The logo for the theme's background: the caller passes `view.logos[deck.theme.logo]`. */
  readonly logoUrl: string | null;
  /** The deck's image links from its newest read. */
  readonly images: ImageLinks;
};

const WEIGHT_CLASS = {
  regular: "font-normal",
  semibold: "font-semibold",
  bold: "font-bold",
} as const;

const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/** The classes and variables of one element box: its place, its frame, and a text's color and size. */
function boxProps(
  box: Box,
  style: ElementStyle | undefined,
  text: { readonly color: string; readonly px: number } | undefined,
  /** Variables for the element's content, such as a second chart's series color. */
  extra?: CssVars
) {
  const border =
    style?.border !== undefined && style.border.width > 0
      ? style.border
      : undefined;

  const framed = style?.fill !== undefined || border !== undefined;

  const vars: CssVars = {
    ...boxVars(box),
    ...(style?.fill === undefined ? undefined : { "--el-fill": style.fill }),
    ...(border === undefined
      ? undefined
      : {
          "--el-border-color": border.color,
          "--el-border-width": `${border.width}px`,
        }),
    ...(text === undefined
      ? undefined
      : { "--el-color": text.color, "--el-size": `${text.px}px` }),
    ...extra,
  };

  return {
    style: vars,
    className: cn(
      PLACED,
      style?.fill !== undefined && "bg-(--el-fill)",
      border !== undefined &&
        "border-solid border-(length:--el-border-width) border-(--el-border-color)",
      // 12 px inside a frame, as the export's margin (P01-8).
      framed && "p-3",
      text !== undefined && "text-(color:--el-color) text-(length:--el-size)",
      style?.align !== undefined && ALIGN_CLASS[style.align]
    ),
  };
}

const weightOf = (style: ElementStyle | undefined) =>
  style?.weight === undefined ? undefined : WEIGHT_CLASS[style.weight];

function titleOf(slide: ShownSlide): string {
  const title = slide.elements.find((element) => element.kind === "title");

  return title !== undefined && "text" in title ? title.text : "Slide";
}

/** The Priorities list: numbered circles in the accent, each item in its `listItemBoxes` slot (P14-13, P14-31). */
function PrioritiesList(props: {
  readonly items: readonly string[];
  readonly box: Box;
  readonly solid: boolean;
}) {
  const { items, box, solid } = props;
  const slots = listItemBoxes(items.length, box);

  const listStyle: CssVars = {
    "--li-circle": `${LOOK_PX.listCircle}px`,
    "--li-number": `${LOOK_PX.listNumber}px`,
    "--li-ring": "1.5px",
  };

  return (
    <ol className="relative h-full" style={listStyle}>
      {items.map((item, at) => {
        const slot = slots[at]!;

        const itemStyle: CssVars = {
          "--li-y": `${slot.circle.y - box.y}px`,
          "--li-text-x": `${slot.text.x - box.x}px`,
        };

        return (
          <li
            key={at}
            className="absolute top-(--li-y) right-0 left-0"
            style={itemStyle}
          >
            <span
              aria-hidden="true"
              data-list-circle=""
              className={cn(
                "absolute top-0 left-0 flex size-(--li-circle) items-center justify-center rounded-full text-(length:--li-number) font-bold",
                solid
                  ? "bg-(--slide-accent) text-(color:--slide-accent-text)"
                  : "border-(length:--li-ring) border-solid border-(--slide-accent) text-(color:--slide-accent)"
              )}
            >
              {at + 1}
            </span>
            <span
              data-list-text=""
              className="absolute top-0 right-0 left-(--li-text-x) leading-(--slide-leading-list) wrap-anywhere"
            >
              {item}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A figure, chart or table's place among the slide's visuals. */
type VisualPlace = {
  /** The box inside its frame padding, at the origin. */
  readonly inner: Box;
  readonly paired: boolean;
  readonly second: boolean;
  readonly valueMax: number | undefined;
  readonly titleHidden: boolean;
  readonly fullText: boolean;
};

function ElementBody(props: {
  readonly element: ShownElement;
  readonly timeZone: string;
  readonly images: ImageLinks;
  /** The Priorities list's box and look; null for every other element. */
  readonly priorities: { readonly box: Box; readonly solid: boolean } | null;
  readonly visual: VisualPlace;
}) {
  const { element, timeZone, images, priorities, visual } = props;

  switch (element.kind) {
    case "title":
      return null;
    case "text":
      return (
        <p
          className={cn(
            weightOf(element.style),
            "leading-(--slide-leading-text) wrap-anywhere"
          )}
        >
          {element.text}
        </p>
      );
    case "bullets":
      return priorities === null ? (
        <ul
          className={cn(
            weightOf(element.style),
            "flex flex-col gap-0.5 leading-(--slide-leading-text)"
          )}
        >
          {element.items.map((item, index) => (
            <li key={index} className="flex gap-2 wrap-anywhere">
              <span aria-hidden="true">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <PrioritiesList
          items={element.items}
          box={priorities.box}
          solid={priorities.solid}
        />
      );
    case "image": {
      const url = images[element.fileId]?.url;

      // Until its link arrives, the image is a named placeholder, never an `img` with no source.
      return url === undefined ? (
        <div
          role="img"
          aria-label={element.alt}
          className="bg-muted h-full w-full rounded"
        />
      ) : (
        <img
          src={url}
          alt={element.alt}
          className="h-full w-full object-contain"
        />
      );
    }

    case "figure":
    case "chart":
    case "table":
      if ("hidden" in element) {
        return (
          <p role="note" className="wrap-anywhere text-sm">
            You can no longer read the data of this chart.
          </p>
        );
      }

      if (element.kind === "figure") {
        return (
          <SlideFigure
            data={element.data}
            box={visual.inner}
            paired={visual.paired}
            second={visual.second}
            timeZone={timeZone}
          />
        );
      }

      return (
        <Chart
          {...element.data}
          timeZone={timeZone}
          slide
          valueMax={visual.valueMax}
          titleHidden={visual.titleHidden}
          fullText={visual.fullText}
        />
      );
  }
}

/**
 * One slide at 960 x 540, scaled to the width of its container so a phone and a desktop show the
 * same layout (D10). Its frame and every box come from `slideFrame` and `placedBoxes`, and each text
 * takes the color the save checks (`textGround`), so the screen and the check agree (czjw.183).
 */
export function SlideCanvas(props: SlideCanvasProps) {
  const { slide, place, figuresAsOf, timeZone, theme, logoUrl, images } = props;

  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [seenImages, setSeenImages] = useState(images);
  const [keptImages, setKeptImages] = useState(images);
  // The logo link expires after 5 minutes; a failed one is hidden so the company name shows alone.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  // Each read brings new links; a link with time left stays, so a poll loads no image again (I1).
  if (images !== seenImages) {
    setSeenImages(images);
    setKeptImages(keepImageLinks(keptImages, images, Date.now()));
  }

  useEffect(() => {
    const element = host.current;

    if (element === null) return;

    const measure = () => {
      const width = element.clientWidth;

      if (width > 0) setScale(width / CANVAS.width);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const first = place.index === 0;

  const frame = slideFrame(
    slide.elements.map(({ kind }) => kind),
    first
  );

  const boxes = placedBoxes(slide.elements, first);
  const solid = theme.layout === "solid";
  const full = frame.name !== "split";
  const titleStyle = slide.elements[0]?.style;

  const hasFigures = slide.elements.some(
    (element) =>
      element.kind === "figure" ||
      element.kind === "chart" ||
      element.kind === "table"
  );

  const visualCount = slide.elements.filter(
    ({ kind }) => kind !== "title" && kind !== "text" && kind !== "bullets"
  ).length;

  const hasVisual = visualCount > 0;

  const valueMax = comparisonMax(slide.elements);

  /** A text's color on what draws behind it, as the save checks it, and its size in its box. */
  const textLook = (index: number, box: Box, priorities: boolean) => {
    const element = slide.elements[index];

    if (
      element === undefined ||
      (element.kind !== "title" &&
        element.kind !== "text" &&
        element.kind !== "bullets")
    ) {
      return undefined;
    }

    const texts = element.kind === "bullets" ? element.items : [element.text];

    return {
      color: textGround(slide, index, theme, first).color,
      px:
        element.style?.fontSize ??
        (priorities
          ? LOOK_PX.list
          : defaultTextPx(
              element.kind,
              frame.name,
              regionOf(box, frame.name),
              texts,
              box
            )),
    };
  };

  const title = boxProps(
    boxes.title,
    titleStyle,
    textLook(0, boxes.title, false)
  );

  const hostStyle: CssVars = {
    "--slide-height": `${CANVAS.height * scale}px`,
  };

  // The slide's own tokens, so it never follows the app's dark mode (Review Focus 4).
  const canvasStyle: CssVars = {
    "--slide-scale": scale,
    "--slide-canvas-width": `${CANVAS.width}px`,
    "--slide-canvas-height": `${CANVAS.height}px`,
    "--slide-bg": slide.background ?? theme.background,
    "--background": theme.background,
    "--foreground": theme.text,
    "--muted-foreground": theme.secondaryText,
    "--border": theme.hairline,
    "--muted": theme.hairline,
    "--chart-1": theme.accent,
    "--chart-2": theme.neutral,
    // A slide background on a title or statement slide replaces the panel fill (P14-15).
    "--slide-panel": full ? (slide.background ?? theme.panel) : theme.panel,
    "--slide-panel-line": theme.panel,
    "--slide-ring": theme.ring,
    "--slide-ring-width": solid ? "12px" : "3px",
    "--slide-accent": theme.accent,
    "--slide-accent-text": theme.accentText,
    "--slide-rule": theme.rule,
    "--slide-number-weight": theme.weight === "bold" ? 700 : 400,
    "--slide-font": theme.fontFace,
    "--slide-footer":
      slide.background === undefined
        ? theme.secondaryText
        : foregroundFor(slide.background),
    "--slide-footer-size": `${LOOK_PX.footer}px`,
    "--slide-leading-title": LINE_HEIGHT.title,
    "--slide-leading-text": LINE_HEIGHT.text,
    "--slide-leading-list": LINE_HEIGHT.list,
    // The font's glyphs reach below a 1.15 line; this keeps a bottom-set title inside its box.
    "--slide-title-descent": "0.1em",
  };

  return (
    <div
      ref={host}
      className="relative h-(--slide-height) w-full overflow-hidden"
      style={hostStyle}
    >
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={titleOf(slide)}
        data-slide-canvas=""
        data-frame={frame.name}
        data-theme={theme.dark ? "dark" : "light"}
        className="absolute top-0 left-0 h-(--slide-canvas-height) w-(--slide-canvas-width) origin-top-left scale-(--slide-scale) overflow-hidden bg-(--slide-bg) font-(family-name:--slide-font) text-foreground"
        style={canvasStyle}
      >
        {/* A solid panel is a fill; a light split panel is a 1 px line; a light title or statement slide has none. */}
        {solid || !full ? (
          <div
            aria-hidden="true"
            data-slide-panel=""
            {...placed(
              frame.panel,
              solid
                ? "bg-(--slide-panel)"
                : "border-r border-solid border-(--slide-panel-line)"
            )}
          />
        ) : null}
        {frame.ring === null ? null : (
          <div
            aria-hidden="true"
            data-slide-ring=""
            {...placed(
              frame.ring,
              "rounded-full border-solid border-(length:--slide-ring-width) border-(--slide-ring)"
            )}
          />
        )}
        {/* A title sits on its box's bottom edge (P14-3). */}
        <div
          data-slide-box="title"
          {...title}
          className={cn(title.className, "flex flex-col justify-end")}
        >
          <p
            className={cn(
              "pb-(--slide-title-descent) leading-(--slide-leading-title) text-balance wrap-anywhere",
              WEIGHT_CLASS[titleStyle?.weight ?? theme.weight]
            )}
          >
            {titleOf(slide)}
          </p>
        </div>
        {boxes.body.map(({ index, box }) => {
          const element = slide.elements[index];

          if (element === undefined) return null;

          // On a split slide with no visual, a bullet list on the content side is the Priorities list.
          const priorities =
            element.kind === "bullets" &&
            frame.name === "split" &&
            !hasVisual &&
            regionOf(box, frame.name) === "content";

          const drawn = drawnStyle(
            element.kind,
            element.style,
            visualGround(box, frame.name, theme, slide.background),
            theme.background
          );

          const border =
            drawn?.border !== undefined && drawn.border.width > 0
              ? drawn.border.width
              : 0;

          const inset =
            drawn?.fill !== undefined || border > 0
              ? FRAME_PADDING + border
              : 0;

          const second = isSecondVisual(slide.elements, index);

          return (
            <div
              key={index}
              data-slide-box={element.kind}
              {...boxProps(
                box,
                drawn,
                textLook(index, box, priorities),
                chartVars(theme, element.kind === "chart" && second)
              )}
            >
              <ElementBody
                element={element}
                timeZone={timeZone}
                images={keptImages}
                priorities={priorities ? { box, solid } : null}
                visual={{
                  inner: {
                    x: 0,
                    y: 0,
                    w: box.w - 2 * inset,
                    h: box.h - 2 * inset,
                  },
                  paired: visualCount === 2,
                  second: element.kind === "figure" && second,
                  valueMax,
                  titleHidden: visualCount === 1 && element.kind === "chart",
                  // A frame box has room for the full title and source line; a stored box can be 160 x 96 (P14-25).
                  fullText: element.box === undefined,
                }}
              />
            </div>
          );
        })}
        {frame.footer === null ? null : (
          <footer
            {...placed(
              frame.footer,
              "flex items-center justify-between gap-4 text-(length:--slide-footer-size) text-(color:--slide-footer)"
            )}
          >
            <span>
              {hasFigures ? `Figures as of ${figuresDate(figuresAsOf)}` : null}
            </span>
            <span className="flex items-center gap-2">
              {logoUrl === null || logoUrl === failedLogo ? null : (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-5 w-auto"
                  onError={() => setFailedLogo(logoUrl)}
                />
              )}
              <span>{`${theme.companyName} · ${place.index + 1} / ${place.count}`}</span>
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
