"use client";

import { Button, Card, CardContent } from "@genie/ui";
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

/** A field: its label, its origin tag and its value. A card, not a button (DK7). */
export function FieldCard(props: {
  readonly field: DeskField;
  readonly className?: string;
  readonly style?: CssVars;
  readonly cardRef?: (element: HTMLDivElement | null) => void;
}): ReactNode {
  const { field } = props;

  return (
    <div
      ref={props.cardRef}
      data-pin={field.key}
      style={props.style}
      className={`flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 shadow-xs ${props.className ?? ""}`}
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
      Math.round(other.bottom) === Math.round(place.bottom)
    );
  });

export type DeskCanvasProps = {
  readonly label: string;
  readonly url: string;
  readonly fields: readonly DeskField[];
  /** From 1280 px the fields pin beside the page; below it the record opens in the sheet. */
  readonly wide: boolean;
  readonly onLoadError: () => void;
  readonly onDownload: () => void;
  /** The control that opens the hidden drawer, or null while it shows. */
  readonly drawerButton: ReactNode;
};

/**
 * The page of a document on its canvas, with its toolbar, and from 1280 px each field pinned beside
 * its source line by a leader line (R-38a, prototype variant C).
 */
export function DeskCanvas(props: DeskCanvasProps): ReactNode {
  const { fields, wide } = props;
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
      fields.flatMap((field): ViewerHighlight[] =>
        field.source === null
          ? []
          : [
              {
                page: field.source.page,
                quote: field.source.quote,
                key: field.key,
                tinted: false,
              },
            ]
      ),
    [fields]
  );

  const keepPlaces = useCallback(
    (next: readonly MarkPlace[]) =>
      setPlaces((last) => (samePlaces(last, next) ? last : next)),
    []
  );

  useLayoutEffect(() => {
    const page = pageBox.current;
    const pins = column.current;

    if (!wide || page === null || pins === null) {
      setGeometry(null);

      return;
    }

    const lineOf = new Map(
      places.map((place) => [place.key, (place.top + place.bottom) / 2])
    );

    const tops = placePins(
      fields.map((field) => ({
        key: field.key,
        lineY: lineOf.get(field.key) ?? null,
        height: cards.current.get(field.key)?.offsetHeight ?? 0,
      })),
      PIN_GAP
    );

    const bottom = Math.max(
      page.offsetHeight,
      ...fields.map(
        (field) =>
          (tops.get(field.key) ?? 0) +
          (cards.current.get(field.key)?.offsetHeight ?? 0)
      )
    );

    setGeometry({
      pins: new Map(
        fields.map((field) => [
          field.key,
          {
            top: tops.get(field.key) ?? 0,
            line: lineOf.get(field.key) ?? null,
          },
        ])
      ),
      dotX: page.offsetLeft + page.offsetWidth - 8,
      pageTop: page.offsetTop,
      cardX: pins.offsetLeft,
      columnTop: pins.offsetTop,
      height: bottom,
    });
  }, [fields, places, wide, pageWidth]);

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
      className="relative min-w-0 flex-1 overflow-auto bg-muted max-xl:rounded-xl xl:h-full"
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
      </div>
      <div
        data-desk-content=""
        className="relative flex w-max min-w-full items-start justify-center px-3 pt-17 pb-40 xl:px-8 xl:pb-14"
      >
        <div
          ref={pageBox}
          className="w-(--desk-page-width) shrink-0 bg-white shadow-md"
          style={pageStyle}
        >
          <LazyDocumentViewer
            url={props.url}
            label={`Source document of ${props.label}`}
            highlights={highlights}
            onPlaces={keepPlaces}
            onLoadError={props.onLoadError}
          />
        </div>
        {wide ? (
          <>
            <div
              ref={column}
              className="relative ml-14 h-(--pin-column-height) w-65 shrink-0"
              style={columnStyle}
            >
              {fields.map((field) => (
                <FieldCard
                  key={field.key}
                  field={field}
                  className="absolute top-(--pin-top) left-0 w-65"
                  style={{
                    "--pin-top": `${geometry?.pins.get(field.key)?.top ?? 0}px`,
                  }}
                  cardRef={(element) => {
                    if (element === null) cards.current.delete(field.key);
                    else cards.current.set(field.key, element);
                  }}
                />
              ))}
            </div>
            {geometry === null ? null : (
              <svg
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width="1"
                height="1"
              >
                {fields.map((field) => {
                  const pin = geometry.pins.get(field.key);
                  const height = cards.current.get(field.key)?.offsetHeight;

                  if (pin?.line == null || height === undefined) return null;

                  const lineY = geometry.pageTop + pin.line;

                  return (
                    <g key={field.key}>
                      <path
                        data-pin-line={field.key}
                        className="fill-none stroke-muted-foreground/60"
                        d={leaderPath({
                          dotX: geometry.dotX,
                          lineY,
                          cardX: geometry.cardX,
                          cardY: geometry.columnTop + pin.top + height / 2,
                        })}
                      />
                      <circle
                        data-pin-dot={field.key}
                        className="fill-muted-foreground"
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
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto xl:pr-4">
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
  readonly fields: readonly DeskField[];
  readonly onDownload: () => void;
  readonly onRetry: () => void;
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto xl:pr-4">
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
      <FieldsCard fields={props.fields} caption="Read from the document" />
    </div>
  );
}
