"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  useMediaQuery,
} from "@genie/ui";
import { FileXIcon, Loader2Icon, Maximize2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { type CssVars, DeskCanvas, type DeskPin } from "./desk-canvas.tsx";
import { LazyDocumentViewer } from "./document-viewer-lazy.tsx";
import type { MarkPlace, ViewerHighlight } from "./document-viewer.tsx";

// The page is wider than the lens, so its text reads larger and the margins fall outside.
const LENS_PAGE: CssVars = { "--lens-page-width": "114%" };

/**
 * The page at 1.14 times the lens width, scrolled so that the current line sits in the middle,
 * with a ring around it (prototype variant C). The person never scrolls the lens.
 */
export function PageLens(props: {
  readonly url: string;
  readonly label: string;
  readonly highlights: readonly ViewerHighlight[];
  /** The line to show; null shows the top of the page. */
  readonly place: MarkPlace | null;
  readonly chip: ReactNode;
  /** The chip announces a change, such as the reading that runs. */
  readonly chipStatus?: boolean;
  readonly onPlaces: (places: readonly MarkPlace[]) => void;
  readonly onLoadError: () => void;
}): ReactNode {
  const { place } = props;
  const scroller = useRef<HTMLDivElement>(null);

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", {
    noSsr: true,
  });

  const top = place?.top;
  const bottom = place?.bottom;

  useEffect(() => {
    const element = scroller.current;

    if (element === null) return;

    const middle =
      top === undefined || bottom === undefined
        ? 0
        : (top + bottom) / 2 - element.clientHeight / 2;

    element.scrollTo({
      top: Math.max(0, middle),
      left: (element.scrollWidth - element.clientWidth) / 2,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [top, bottom, reducedMotion]);

  const spotStyle: CssVars | undefined =
    place === null
      ? undefined
      : {
          "--spot-top": `${place.top - 4}px`,
          "--spot-left": `${place.left - 6}px`,
          "--spot-width": `${place.right - place.left + 12}px`,
          "--spot-height": `${place.bottom - place.top + 8}px`,
        };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
      <div
        ref={scroller}
        data-review-lens=""
        className="h-48 overflow-hidden md:h-72"
        style={LENS_PAGE}
      >
        <div className="relative w-(--lens-page-width)">
          <LazyDocumentViewer
            url={props.url}
            label={props.label}
            highlights={props.highlights}
            onPlaces={props.onPlaces}
            onLoadError={props.onLoadError}
          />
          {place === null ? null : (
            <div
              data-lens-spot=""
              aria-hidden
              className="pointer-events-none absolute top-(--spot-top) left-(--spot-left) h-(--spot-height) w-(--spot-width) rounded-md bg-primary/25 ring-2 ring-ring"
              style={spotStyle}
            />
          )}
        </div>
      </div>
      {props.chip === null ? null : (
        <span
          role={props.chipStatus === true ? "status" : undefined}
          className="absolute top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-semibold whitespace-nowrap text-background shadow-md [&_svg]:size-3.5"
        >
          {props.chip}
        </span>
      )}
    </div>
  );
}

/**
 * The whole page over the screen, with its toolbar: a dialog over the viewport, because an iPhone
 * has no Fullscreen API. It leaves on Escape or Close, and the focus returns to Open document.
 */
function DocumentDialog(props: {
  readonly url: string;
  readonly label: string;
  readonly pins: readonly DeskPin[];
  readonly selected: string | null;
  readonly onLoadError: () => void;
  readonly onDownload: () => void;
}): ReactNode {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-3 bottom-3"
          />
        }
      >
        <Maximize2Icon aria-hidden />
        Open document
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="inset-0 z-50 overflow-visible md:inset-0 md:w-auto md:translate-none"
      >
        {/* The popup's own card, border and padding stay behind this viewport layer. */}
        <div className="fixed inset-0 flex flex-col bg-background">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <DialogTitle className="min-w-0 flex-1">
              <span className="block truncate">{props.label}</span>
            </DialogTitle>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close the document"
                />
              }
            >
              <XIcon aria-hidden />
            </DialogClose>
          </div>
          <div className="flex min-h-0 flex-1 p-3">
            <DeskCanvas
              label={props.label}
              url={props.url}
              pins={props.pins}
              renderCard={() => null}
              wide={false}
              selected={props.selected}
              onLoadError={props.onLoadError}
              onDownload={props.onDownload}
              drawerButton={null}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The page above the phone form: the selected field's line in a lens, and Open document (czjw.187). */
export function ReviewPreview(props: {
  readonly url: string;
  readonly label: string;
  readonly pins: readonly DeskPin[];
  /** The selected field's line; null shows the top of the page. */
  readonly place: MarkPlace | null;
  readonly selected: string | null;
  /** The job still reads: the lens chip says "Reading the page". */
  readonly reading: boolean;
  /** The selected field has a quote but no line on the page: the chip says "Not found on the page". */
  readonly lost: boolean;
  readonly onPlaces: (places: readonly MarkPlace[]) => void;
  readonly onLoadError: () => void;
  readonly onDownload: () => void;
}): ReactNode {
  const { pins } = props;

  // Memoised: a new array would draw the text layer again, which reports places again.
  const highlights = useMemo(
    () =>
      pins.flatMap((pin) =>
        pin.sources.map((source): ViewerHighlight => ({
          page: source.page,
          quote: source.quote,
          key: pin.key,
          tinted: false,
        }))
      ),
    [pins]
  );

  return (
    <div className="relative">
      <PageLens
        url={props.url}
        label={props.label}
        highlights={highlights}
        place={props.place}
        chip={
          props.reading ? (
            <>
              <Loader2Icon aria-hidden className="motion-safe:animate-spin" />
              Reading the page
            </>
          ) : props.lost ? (
            <>
              <FileXIcon aria-hidden />
              Not found on the page
            </>
          ) : null
        }
        chipStatus={props.reading}
        onPlaces={props.onPlaces}
        onLoadError={props.onLoadError}
      />
      <DocumentDialog
        url={props.url}
        label={props.label}
        pins={pins}
        selected={props.selected}
        onLoadError={props.onLoadError}
        onDownload={props.onDownload}
      />
    </div>
  );
}
