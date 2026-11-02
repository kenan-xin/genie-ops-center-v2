"use client";

import { Chart } from "@genie/ui/chart";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { type ImageLinks, keepImageLinks } from "./image-links.ts";
import { CANVAS, figuresDate, slideLayout, TYPE_PX } from "./slide-layout.ts";
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
        <p className="text-(length:--slide-text-size) leading-normal wrap-anywhere">
          {element.text}
        </p>
      );
    case "bullets":
      return (
        <ul className="text-(length:--slide-bullet-size) flex h-full flex-col justify-center gap-0.5 leading-tight">
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
  };

  const titleStyle: CssVars = {
    "--box-x": `${layout.title.x}px`,
    "--box-y": `${layout.title.y}px`,
    "--box-w": `${layout.title.w}px`,
    "--box-h": `${layout.title.h}px`,
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
        className="absolute top-0 left-0 h-(--slide-canvas-height) w-(--slide-canvas-width) origin-top-left scale-(--slide-scale) overflow-hidden bg-background font-(family-name:--slide-font) text-foreground"
        style={canvasStyle}
      >
        <div
          data-slide-box="title"
          className="absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w)"
          style={titleStyle}
        >
          <p className="text-(length:--slide-title-size) leading-tight wrap-anywhere font-bold">
            {titleOf(slide)}
          </p>
        </div>
        <div
          className="absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w) bg-(--slide-primary)"
          style={ruleStyle}
        />
        {layout.body.map(({ index, box }) => {
          const element = slide.elements[index];

          return element === undefined ? null : (
            <div
              key={index}
              data-slide-box={element.kind}
              className="absolute top-(--box-y) left-(--box-x) h-(--box-h) w-(--box-w)"
              style={
                // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                {
                  "--box-x": `${box.x}px`,
                  "--box-y": `${box.y}px`,
                  "--box-w": `${box.w}px`,
                  "--box-h": `${box.h}px`,
                } as CssVars
              }
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
          className="absolute top-(--box-y) left-(--box-x) flex h-(--box-h) w-(--box-w) items-center justify-between gap-4 text-muted-foreground"
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
