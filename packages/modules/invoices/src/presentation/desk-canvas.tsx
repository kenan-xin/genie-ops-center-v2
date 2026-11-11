"use client";

import { Button, Card, CardContent, Skeleton, useMediaQuery } from "@genie/ui";
import {
  DownloadIcon,
  FileTextIcon,
  FileXIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoveHorizontalIcon,
  RotateCcwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { FieldOrigin } from "../contract.ts";
import { leaderPath, PIN_GAP, placePins } from "./desk-pins.ts";
import { LazyDocumentViewer } from "./document-viewer-lazy.tsx";
import type { MarkPlace, ViewerHighlight } from "./document-viewer.tsx";
import { OriginTag } from "./review-fields.tsx";

/** One field of the record beside its document (R-38a). */
export type DeskField = {
  /** The reading field: it keys the pin, the mark and `data-pin`. */
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tag: FieldOrigin | null;
  /** The page and quote of an extracted value; null gives no pin. */
  readonly source: { readonly page: number; readonly quote: string } | null;
};

/** A style of CSS custom properties, which the classes read (shadcn `no-inline-styles`). */
export type CssVars = CSSProperties & Record<`--${string}`, string | number>;

/** The width of an A4 page in PDF points: the zoom and the narrowest page are measured against it. */
const A4_WIDTH = 595;

const ZOOM = { min: 50, max: 250, step: 25, fit: 100 } as const;

/** The pin column (260 px) and its gap from the page (56 px), with the canvas padding (DK6). */
const PIN_ROOM = 316;

const CANVAS_PADDING = 64;

/** The scan line goes down the page once in this time when the reading lands (czjw.98, P09-2). */
export const SWEEP_MS = 900;

/** One pass of the scan line while the job reads. */
const LOOP_MS = 2_400;

/** The scan line starts at the top; the sweep then moves it without a render. */
const SCAN_START: CssVars = { "--scan-top": "0px" };

/** A field: its label, its origin tag and its value. A card, not a button (DK7). */
export function FieldCard(props: { readonly field: DeskField }): ReactNode {
  const { field } = props;

  return (
    <div
      data-pin={field.key}
      className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 shadow-xs"
    >
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{field.label}</span>
        {field.tag === null ? null : <OriginTag tag={field.tag} />}
      </span>
      <span className="font-semibold break-words">{field.value}</span>
    </div>
  );
}

/** The fields in two columns, when the page cannot show them beside their lines. */
export function FieldsCard(props: {
  readonly fields: readonly DeskField[];
  readonly caption: string;
}): ReactNode {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Fields</h2>
            <span className="text-sm text-muted-foreground">
              {props.caption}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {props.fields.map((field) => (
              <FieldCard key={field.key} field={field} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** A state card in place of the page: an icon, a title, a sentence and its actions. */
function StateCard(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly text: string;
  readonly alert?: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <Card role={props.alert ? "alert" : undefined}>
      <CardContent>
        <div className="flex flex-col items-start gap-4">
          <span className="text-muted-foreground [&_svg]:size-6" aria-hidden>
            {props.icon}
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{props.title}</h2>
            <p className="text-muted-foreground">{props.text}</p>
          </div>
          {props.children}
        </div>
      </CardContent>
    </Card>
  );
}

type Pin = { readonly top: number; readonly line: number | null };

type Geometry = {
  readonly pins: ReadonlyMap<string, Pin>;
  readonly dotX: number;
  readonly pageTop: number;
  readonly cardX: number;
  readonly columnTop: number;
  readonly height: number;
};

const samePlaces = (
  a: readonly MarkPlace[],
  b: readonly MarkPlace[]
): boolean =>
  a.length === b.length &&
  a.every((place, index) => {
    const other = b[index];

    return (
      other !== undefined &&
      other.key === place.key &&
      Math.round(other.top) === Math.round(place.top) &&
      Math.round(other.bottom) === Math.round(place.bottom) &&
      Math.round(other.left) === Math.round(place.left) &&
      Math.round(other.right) === Math.round(place.right)
    );
  });

/** One card beside the page and the quotes it pins to; no quote gives a card with no pin. */
export type DeskPin = {
  readonly key: string;
  readonly sources: readonly {
    readonly page: number;
    readonly quote: string;
  }[];
};

export type DeskCanvasProps = {
  readonly label: string;
  readonly url: string;
  /** The cards beside the page, in list order. */
  readonly pins: readonly DeskPin[];
  readonly renderCard: (key: string) => ReactNode;
  /**
   * On a wide desk (`DESK_PINS_FROM` of its own width) the cards pin beside the page; else the
   * page shows alone.
   */
  readonly wide: boolean;
  /** The key whose line is boxed as selected. */
  readonly selected?: string | null;
  /** The key whose line and card light under the pointer (prototype variant B). */
  readonly hovered?: string | null;
  /** The pointer entered a card or a marked line (its key), or left it (null). */
  readonly onHover?: (key: string | null) => void;
  readonly onLoadError: () => void;
  readonly onDownload: () => void;
  /** The control that opens the hidden drawer, or null while it shows. */
  readonly drawerButton: ReactNode;
  /**
   * "loop" while the job reads; "sweep" once, when the reading lands: each card shows as the line
   * passes its line.
   */
  readonly scan?: "loop" | "sweep" | null;
  /** The sweep reached the bottom of the page, or ended at once under reduced motion. */
  readonly onSweepEnd?: () => void;
};

/**
 * The page of a document on its canvas, with its toolbar, and on a wide desk each field pinned
 * beside its source line by a leader line (R-38a, prototype variant C).
 */
export function DeskCanvas(props: DeskCanvasProps): ReactNode {
  const { pins, wide, onHover } = props;
  const scan = props.scan ?? null;
  const canvas = useRef<HTMLDivElement>(null);
  const pageBox = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [zoom, setZoom] = useState<number>(ZOOM.fit);
  const [places, setPlaces] = useState<readonly MarkPlace[]>([]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [canFullScreen, setCanFullScreen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  // Bumped when a card changes height, so the pins are placed again ("Read as", an error).
  const [resized, setResized] = useState(0);
  const pinKeys = pins.map((pin) => pin.key).join(" ");

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", {
    noSsr: true,
  });

  // The keys whose line the sweep passed; a card shows once its key is here.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());

  // The sweep reads the places and the end callback as they are now, not as they were at its start.
  const latest = useRef({ places, onSweepEnd: props.onSweepEnd });

  useLayoutEffect(() => {
    latest.current = { places, onSweepEnd: props.onSweepEnd };
  });

  useEffect(() => {
    const root = canvas.current;
    const page = pageBox.current;

    if (scan === null) return;

    if (scan === "sweep" && (reducedMotion || root === null || page === null)) {
      latest.current.onSweepEnd?.();

      return;
    }

    if (root === null || page === null || reducedMotion) return;

    // The line moves through a custom property, so no frame renders the canvas again.
    const start = performance.now();
    const shown = new Set<string>();
    let frame = 0;

    const tick = (now: number) => {
      const height = page.offsetHeight;

      if (scan === "loop") {
        root.style.setProperty(
          "--scan-top",
          `${(((now - start) % LOOP_MS) / LOOP_MS) * height}px`
        );
        frame = requestAnimationFrame(tick);

        return;
      }

      const done = Math.min(1, (now - start) / SWEEP_MS);
      const lineY = done * height;

      root.style.setProperty("--scan-top", `${lineY}px`);

      const passed = latest.current.places.filter(
        (place) =>
          !shown.has(place.key) && (place.top + place.bottom) / 2 <= lineY
      );

      for (const place of passed) shown.add(place.key);

      if (passed.length > 0) setRevealed(new Set(shown));

      if (done < 1) frame = requestAnimationFrame(tick);
      else latest.current.onSweepEnd?.();
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [scan, reducedMotion]);

  // A card with no place on the page shows when the sweep ends.
  const shownOf = (key: string) => scan !== "sweep" || revealed.has(key);

  useEffect(() => {
    if (!wide) return;

    const observer = new ResizeObserver(() => setResized((last) => last + 1));

    for (const card of cards.current.values()) observer.observe(card);

    return () => observer.disconnect();
  }, [wide, pinKeys]);

  useEffect(() => {
    const element = canvas.current;

    if (element === null) return;

    const observer = new ResizeObserver(([entry]) =>
      setCanvasWidth(Math.floor(entry?.contentRect.width ?? 0))
    );

    observer.observe(element);
    setCanFullScreen(document.fullscreenEnabled);

    const changed = () =>
      setFullScreen(document.fullscreenElement === canvas.current);

    document.addEventListener("fullscreenchange", changed);

    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);

  const pageWidth =
    canvasWidth === 0
      ? 0
      : Math.floor(
          (wide
            ? Math.max(0.45 * A4_WIDTH, canvasWidth - CANVAS_PADDING - PIN_ROOM)
            : canvasWidth - 24) *
            (zoom / 100)
        );

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

  const keepPlaces = useCallback(
    (next: readonly MarkPlace[]) =>
      setPlaces((last) => (samePlaces(last, next) ? last : next)),
    []
  );

  useLayoutEffect(() => {
    const page = pageBox.current;
    const pinColumn = column.current;

    if (!wide || page === null || pinColumn === null) {
      setGeometry(null);

      return;
    }

    const lineOf = new Map(
      places.map((place) => [place.key, (place.top + place.bottom) / 2])
    );

    const tops = placePins(
      pins.map((pin) => ({
        key: pin.key,
        lineY: lineOf.get(pin.key) ?? null,
        height: cards.current.get(pin.key)?.offsetHeight ?? 0,
      })),
      PIN_GAP
    );

    const bottom = Math.max(
      page.offsetHeight,
      ...pins.map(
        (pin) =>
          (tops.get(pin.key) ?? 0) +
          (cards.current.get(pin.key)?.offsetHeight ?? 0)
      )
    );

    setGeometry({
      pins: new Map(
        pins.map((pin) => [
          pin.key,
          {
            top: tops.get(pin.key) ?? 0,
            line: lineOf.get(pin.key) ?? null,
          },
        ])
      ),
      dotX: page.offsetLeft + page.offsetWidth - 8,
      pageTop: page.offsetTop,
      cardX: pinColumn.offsetLeft,
      columnTop: pinColumn.offsetTop,
      height: bottom,
    });
  }, [pins, places, wide, pageWidth, resized]);

  const litOf = (key: string) =>
    props.selected === key
      ? "selected"
      : props.hovered === key
        ? "hovered"
        : undefined;

  const litKeys = new Set(
    [props.selected, props.hovered].filter((key) => key != null)
  );

  // The marks are untinted, so the lit line gets a box over them (4 px wider, 3 px taller each side).
  const lineBoxes = places
    .filter((place) => litKeys.has(place.key))
    .map((place) => {
      const boxStyle: CssVars = {
        "--box-top": `${place.top - 3}px`,
        "--box-left": `${place.left - 4}px`,
        "--box-width": `${place.right - place.left + 8}px`,
        "--box-height": `${place.bottom - place.top + 6}px`,
      };

      return (
        <div
          key={`${place.key}-${place.top}`}
          aria-hidden
          data-line-box={place.key}
          data-lit={litOf(place.key)}
          className="pointer-events-none absolute top-(--box-top) left-(--box-left) h-(--box-height) w-(--box-width) rounded-sm border border-ring data-[lit=hovered]:bg-primary/10 data-[lit=selected]:bg-primary/25"
          style={boxStyle}
        />
      );
    });

  const hoverMark = (target: EventTarget) =>
    onHover?.(
      target instanceof Element
        ? (target.closest<HTMLElement>("mark[data-highlight]")?.dataset
            .highlight ?? null)
        : null
    );

  const pageStyle: CssVars = {
    "--desk-page-width": pageWidth === 0 ? "100%" : `${pageWidth}px`,
  };

  const columnStyle: CssVars = {
    "--pin-column-height": `${geometry?.height ?? 0}px`,
  };

  const toggleFullScreen = () => {
    if (document.fullscreenElement === null) {
      void canvas.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <div
      ref={canvas}
      className={
        wide
          ? "relative h-full min-w-0 flex-1 overflow-auto bg-muted"
          : "relative min-w-0 flex-1 overflow-auto rounded-xl bg-muted"
      }
      style={SCAN_START}
    >
      <div className="sticky top-3 left-3 z-10 h-0 w-max">
        <div
          role="toolbar"
          aria-label="Document"
          className="mt-3 ml-3 flex items-center gap-0.5 rounded-lg bg-card p-1 shadow-md ring-1 ring-border"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={zoom <= ZOOM.min}
            onClick={() => setZoom((last) => last - ZOOM.step)}
          >
            <ZoomOutIcon />
          </Button>
          <span
            aria-live="polite"
            className="min-w-12 text-center text-sm tabular-nums"
          >
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={zoom >= ZOOM.max}
            onClick={() => setZoom((last) => last + ZOOM.step)}
          >
            <ZoomInIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fit to width"
            onClick={() => setZoom(ZOOM.fit)}
          >
            <MoveHorizontalIcon />
          </Button>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {canFullScreen ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={fullScreen ? "Exit full screen" : "Full screen"}
              onClick={toggleFullScreen}
            >
              {fullScreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download the PDF"
            onClick={props.onDownload}
          >
            <DownloadIcon />
          </Button>
          {props.drawerButton}
        </div>
        {scan === null ? null : (
          <p
            role="status"
            className="mt-2 ml-3 w-max rounded-lg bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-md ring-1 ring-border"
          >
            Reading. Fields appear as each line is read.
          </p>
        )}
      </div>
      <div
        data-desk-content=""
        className={
          wide
            ? "relative flex w-max min-w-full items-start justify-center px-8 pt-17 pb-14"
            : "relative flex w-max min-w-full items-start justify-center px-3 pt-17 pb-40"
        }
      >
        <div
          ref={pageBox}
          className="relative w-(--desk-page-width) shrink-0 bg-white shadow-md"
          style={pageStyle}
          onPointerOver={
            onHover === undefined
              ? undefined
              : (event) => hoverMark(event.target)
          }
          onPointerLeave={
            onHover === undefined ? undefined : () => onHover(null)
          }
        >
          <LazyDocumentViewer
            url={props.url}
            label={`Source document of ${props.label}`}
            highlights={highlights}
            onPlaces={keepPlaces}
            onLoadError={props.onLoadError}
          />
          {lineBoxes}
          {scan === null ? null : (
            // The unread part of the page stays veiled below the scan line (prototype variant A).
            <div
              aria-hidden
              data-scan={scan}
              className="pointer-events-none absolute inset-x-0 top-(--scan-top) bottom-0 border-t-2 border-primary bg-muted/60"
            />
          )}
        </div>
        {wide ? (
          <>
            <div
              ref={column}
              className="relative ml-14 h-(--pin-column-height) w-65 shrink-0"
              style={columnStyle}
            >
              {scan === null ? null : (
                <div
                  data-skeleton-card=""
                  aria-hidden
                  className={`absolute left-0 flex w-65 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs ${scan === "sweep" ? "top-(--scan-top)" : "top-0"}`}
                >
                  <Skeleton className="w-1/3" />
                  <Skeleton className="w-full" />
                </div>
              )}
              {pins.map((pin) => {
                const pinStyle: CssVars = {
                  "--pin-top": `${geometry?.pins.get(pin.key)?.top ?? 0}px`,
                };

                return (
                  <div
                    key={pin.key}
                    data-pin-card={pin.key}
                    data-lit={litOf(pin.key)}
                    data-revealed={shownOf(pin.key) ? "" : undefined}
                    // Invisible, not hidden, so a card keeps its height and no card moves.
                    className={`absolute top-(--pin-top) left-0 w-65 ${shownOf(pin.key) ? "" : "invisible"}`}
                    style={pinStyle}
                    ref={(element) => {
                      if (element === null) cards.current.delete(pin.key);
                      else cards.current.set(pin.key, element);
                    }}
                    onPointerEnter={
                      onHover === undefined ? undefined : () => onHover(pin.key)
                    }
                    onPointerLeave={
                      onHover === undefined ? undefined : () => onHover(null)
                    }
                  >
                    {props.renderCard(pin.key)}
                  </div>
                );
              })}
            </div>
            {geometry === null ? null : (
              <svg
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width="1"
                height="1"
              >
                {pins.map(({ key }) => {
                  const pin = geometry.pins.get(key);
                  const height = cards.current.get(key)?.offsetHeight;

                  if (
                    pin?.line == null ||
                    height === undefined ||
                    !shownOf(key)
                  )
                    return null;

                  const lineY = geometry.pageTop + pin.line;

                  return (
                    <g key={key}>
                      <path
                        data-pin-line={key}
                        data-lit={litOf(key)}
                        className="fill-none stroke-muted-foreground/60 data-lit:stroke-ring"
                        d={leaderPath({
                          dotX: geometry.dotX,
                          lineY,
                          cardX: geometry.cardX,
                          cardY: geometry.columnTop + pin.top + height / 2,
                        })}
                      />
                      <circle
                        data-pin-dot={key}
                        data-lit={litOf(key)}
                        className="fill-muted-foreground data-lit:fill-ring"
                        cx={geometry.dotX}
                        cy={lineY}
                        r={2.5}
                      />
                    </g>
                  );
                })}
              </svg>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The canvas of a record with no document: the reason, then its fields (prototype no-PDF state). */
export function NoDocument(props: {
  readonly kind: "invoice" | "payment";
  readonly fields: readonly DeskField[];
  readonly wide: boolean;
}): ReactNode {
  return (
    <div
      className={
        props.wide
          ? "flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-4"
          : "flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto"
      }
    >
      <StateCard
        icon={<FileTextIcon />}
        title="No document"
        text={`This ${props.kind} was entered by hand.`}
      />
      <FieldsCard fields={props.fields} caption="Entered by hand" />
    </div>
  );
}

/** The canvas when the page does not load: the file is safe, Download and Try again (R-38a). */
export function PreviewFailed(props: {
  /** The record's fields; the review shows its cards in its own panel. */
  readonly fields?: readonly DeskField[];
  readonly onDownload: () => void;
  readonly onRetry: () => void;
  readonly wide: boolean;
}): ReactNode {
  return (
    <div
      className={
        props.wide
          ? "flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-4"
          : "flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto"
      }
    >
      <StateCard
        alert
        icon={<FileXIcon />}
        title="The preview could not load"
        text="The file is stored and unchanged. Download it to read it, or try the preview again."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onDownload}>
            <DownloadIcon />
            Download the PDF
          </Button>
          <Button variant="ghost" onClick={props.onRetry}>
            <RotateCcwIcon />
            Try again
          </Button>
        </div>
      </StateCard>
      {props.fields === undefined ? null : (
        <FieldsCard fields={props.fields} caption="Read from the document" />
      )}
    </div>
  );
}
