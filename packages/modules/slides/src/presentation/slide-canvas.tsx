"use client";

import { foregroundFor } from "@genie/core/features/branding";
import { Chart } from "@genie/ui/chart";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { type ElementBox, type ElementStyle, THEME_TEXT } from "../contract.ts";
import { type ImageLinks, keepImageLinks } from "./image-links.ts";
import {
  CANVAS,
  drawnStyle,
  elementBoxes,
  figuresDate,
  slideLayout,
  TYPE_PX,
} from "./slide-layout.ts";
import type { DeckPageView, ShownElement, ShownSlide } from "./views.ts";

export type SlideCanvasProps = {
  readonly slide: ShownSlide;
  readonly figuresAsOf: string;
  readonly timeZone: string;
  readonly theme: DeckPageView["theme"];
  readonly logoUrl: string | null;
  /** The deck's image links from its newest read. */
  readonly images: ImageLinks;
};

/** A style object of CSS custom properties only; the classes read them. */
type CssVars = CSSProperties & {
  readonly [key: `--${string}`]: string | number;
};

/** Joins the classes that apply; the lists here set no two classes of one property. */
const cn = (...classes: readonly (string | false | undefined)[]) =>
  classes.filter(Boolean).join(" ");

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

/**
 * A slide with a background or a colored element draws on the light palette under its own values,
 * so the pair on screen is the pair the save checked, in the dark theme too (P13-3).
 */
function usesLightPalette(slide: ShownSlide): boolean {
  return (
    slide.background !== undefined ||
    slide.elements.some(
      ({ style }) => style?.color !== undefined || style?.fill !== undefined
    )
  );
}

/** The classes and variables of one element box: its place, its frame and its text style. */
function boxProps(box: ElementBox, style: ElementStyle | undefined) {
  const border =
    style?.border !== undefined && style.border.width > 0
      ? style.border
      : undefined;

  const framed = style?.fill !== undefined || border !== undefined;

  const vars: CssVars = {
    "--box-x": `${box.x}px`,
    "--box-y": `${box.y}px`,
    "--box-w": `${box.w}px`,
    "--box-h": `${box.h}px`,
    ...(style?.fill === undefined ? undefined : { "--el-fill": style.fill }),
    ...(border === undefined
      ? undefined
      : {
          "--el-border-color": border.color,
          "--el-border-width": `${border.width}px`,
        }),
    ...(style?.color === undefined ? undefined : { "--el-color": style.color }),
    ...(style?.fontSize === undefined
      ? undefined
      : { "--el-size": `${style.fontSize}px` }),
  };

  return {
    style: vars,
    className: cn(
      "absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w)",
      style?.fill !== undefined && "bg-(--el-fill)",
      border !== undefined &&
        "border-solid border-(length:--el-border-width) border-(--el-border-color)",
      // 12 px inside a frame, as the export's margin (P01-8).
      framed && "p-3",
      style?.color !== undefined && "text-(color:--el-color)",
      style?.align !== undefined && ALIGN_CLASS[style.align]
    ),
  };
}

/** The text classes an element's style sets over its kind's default size and weight. */
function textClass(style: ElementStyle | undefined, fallback: string): string {
  return cn(
    style?.fontSize === undefined ? fallback : "text-(length:--el-size)",
    style?.weight !== undefined && WEIGHT_CLASS[style.weight]
  );
}

function titleOf(slide: ShownSlide): string {
  const title = slide.elements.find((element) => element.kind === "title");

  return title !== undefined && "text" in title ? title.text : "Slide";
}

function ElementBody(props: {
  readonly element: ShownElement;
  readonly timeZone: string;
  readonly images: ImageLinks;
}) {
  const { element, timeZone, images } = props;

  switch (element.kind) {
    case "title":
      return null;
    case "text":
      return (
        <p
          className={cn(
            textClass(element.style, "text-(length:--slide-text-size)"),
            "leading-normal wrap-anywhere"
          )}
        >
          {element.text}
        </p>
      );
    case "bullets":
      return (
        <ul
          className={cn(
            textClass(element.style, "text-(length:--slide-bullet-size)"),
            "flex h-full flex-col justify-center gap-0.5 leading-tight"
          )}
        >
          {element.items.map((item, index) => (
            <li key={index} className="flex gap-2 wrap-anywhere">
              <span aria-hidden="true">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
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

      return <Chart {...element.data} timeZone={timeZone} slide />;
  }
}

/**
 * One slide at 960 x 540, scaled to the width of its container so a phone and a desktop show the
 * same layout (D10). Every box is absolute, from the shared `slideLayout`.
 */
export function SlideCanvas(props: SlideCanvasProps) {
  const { slide, figuresAsOf, timeZone, theme, logoUrl, images } = props;
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

  const layout = slideLayout(slide.elements.map(({ kind }) => kind));
  const boxes = elementBoxes(slide.elements);
  const light = usesLightPalette(slide);
  const titleStyle = slide.elements[0]?.style;
  const title = boxProps(boxes.title, titleStyle);

  const hasFigures = slide.elements.some(
    (element) =>
      element.kind === "figure" ||
      element.kind === "chart" ||
      element.kind === "table"
  );

  const hostStyle: CssVars = {
    "--slide-height": `${CANVAS.height * scale}px`,
  };

  const canvasStyle: CssVars = {
    "--slide-scale": scale,
    "--slide-canvas-width": `${CANVAS.width}px`,
    "--slide-canvas-height": `${CANVAS.height}px`,
    "--slide-font": theme.fontFace,
    "--slide-title-size": `${TYPE_PX.title}px`,
    "--slide-text-size": `${TYPE_PX.text}px`,
    "--slide-bullet-size": `${TYPE_PX.bullet}px`,
    "--slide-footer-size": `${TYPE_PX.footer}px`,
    "--slide-primary": theme.primaryColor,
    // Read only with a background (`bg-(--slide-bg)` below).
    "--slide-bg": slide.background ?? "initial",
    "--slide-footer":
      slide.background === undefined
        ? THEME_TEXT
        : foregroundFor(slide.background),
  };

  const ruleStyle: CssVars = {
    "--box-x": `${layout.rule.x}px`,
    "--box-y": `${layout.rule.y}px`,
    "--box-w": `${layout.rule.w}px`,
    "--box-h": `${layout.rule.h}px`,
  };

  const footerStyle: CssVars = {
    "--box-x": `${layout.footer.x}px`,
    "--box-y": `${layout.footer.y}px`,
    "--box-w": `${layout.footer.w}px`,
    "--box-h": `${layout.footer.h}px`,
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
        // The light tokens on a styled slide, so its colors meet the theme's text (P13-3).
        data-theme={light ? "light" : undefined}
        className={cn(
          "absolute top-0 left-0 h-(--slide-canvas-height) w-(--slide-canvas-width) origin-top-left scale-(--slide-scale) overflow-hidden font-(family-name:--slide-font) text-foreground",
          slide.background === undefined ? "bg-background" : "bg-(--slide-bg)"
        )}
        style={canvasStyle}
      >
        <div data-slide-box="title" {...title}>
          <p
            className={cn(
              "leading-tight wrap-anywhere",
              titleStyle?.weight === undefined && "font-bold",
              textClass(titleStyle, "text-(length:--slide-title-size)")
            )}
          >
            {titleOf(slide)}
          </p>
        </div>
        <div
          className="absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w) bg-(--slide-primary)"
          style={ruleStyle}
        />
        {boxes.body.map(({ index, box }) => {
          const element = slide.elements[index];

          return element === undefined ? null : (
            <div
              key={index}
              data-slide-box={element.kind}
              {...boxProps(
                box,
                drawnStyle(element.kind, element.style, slide.background)
              )}
            >
              <ElementBody
                element={element}
                timeZone={timeZone}
                images={keptImages}
              />
            </div>
          );
        })}
        <footer
          className={cn(
            "absolute top-(--box-y) left-(--box-x) flex h-(--box-h) w-(--box-w) items-center justify-between gap-4",
            light ? "text-(color:--slide-footer)" : "text-muted-foreground"
          )}
          style={footerStyle}
        >
          <span className="text-(length:--slide-footer-size)">
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
            <span className="text-(length:--slide-footer-size)">
              {theme.companyName}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}
