"use client";

import { Skeleton } from "@genie/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Document, Page, pdfjs, type TextContent } from "react-pdf";

import "react-pdf/dist/Page/TextLayer.css";

import {
  type CharRange,
  markedHtml,
  type MarkTag,
  quoteRanges,
  type TextItem,
} from "./quote-marks.ts";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// shortcut: no wasmUrl is set, so pdf.js decoders that need WASM, for example JPEG 2000
// images, do not run. Set wasmUrl when a document that needs one must draw.

/**
 * A quote to mark on a page. A `key` names its marks, so `onPlaces` reports where they sit; an
 * untinted one (`tinted: false`) is found but shows no colour, and the viewer never scrolls to it.
 */
export type ViewerHighlight = {
  readonly page: number;
  readonly quote: string;
  readonly key?: string;
  readonly tinted?: false;
};

/** The union of the marks of one key, in px from the top left corner of the viewer region. */
export type MarkPlace = {
  readonly key: string;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export type DocumentViewerProps = {
  readonly url: string;
  /** The label of the document; it names the viewer region for assistive technology. */
  readonly label: string;
  readonly highlights: readonly ViewerHighlight[];
  /** The places of the keyed marks, again after each page draws its text layer. */
  readonly onPlaces?: (places: readonly MarkPlace[]) => void;
  /** The file did not load: its link failed, or it is not a PDF. */
  readonly onLoadError?: () => void;
};

/** The placeholder while the document or a page draws: one block of page shape. */
function PageSkeleton() {
  return <Skeleton aria-hidden className="aspect-3/4 w-full" />;
}

/** The one failure state: the reason, and the PDF itself. */
function LoadFailure(props: { readonly url: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p>The document could not be shown.</p>
      <a
        href={props.url}
        target="_blank"
        rel="noopener"
        className="text-primary underline"
      >
        Open the PDF
      </a>
    </div>
  );
}

/** PDF text items in the shape quote-marks reads; marked content keeps its index with no text. */
function textItems(items: TextContent["items"]): readonly TextItem[] {
  return items.map((item) =>
    "str" in item
      ? { str: item.str, hasEOL: item.hasEOL }
      : { str: "", hasEOL: false }
  );
}

type PageProps = {
  readonly pageNumber: number;
  readonly width: number;
  readonly highlights: readonly ViewerHighlight[];
  readonly failure: ReactNode;
  /** The marks of this page, measured once its text layer has drawn. */
  readonly onMarks: (pageNumber: number, marks: readonly HTMLElement[]) => void;
};

/** The ranges of each highlight, tagged with its index, so each mark can carry its key. */
function taggedRanges(
  items: readonly TextItem[],
  quotes: readonly string[]
): ReadonlyMap<number, readonly CharRange[]> {
  const tagged = new Map<number, CharRange[]>();

  quotes.forEach((quote, highlight) => {
    for (const [item, ranges] of quoteRanges(items, [quote])) {
      tagged.set(item, [
        ...(tagged.get(item) ?? []),
        ...ranges.map(([start, end]): CharRange => [start, end, highlight]),
      ]);
    }
  });

  return tagged;
}

/** One page at the measured width, with the quotes of its highlights marked in its text layer. */
function DocumentPage(props: PageProps) {
  const { onMarks, pageNumber } = props;
  const element = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<readonly TextItem[]>([]);

  const own = useMemo(
    () => props.highlights.filter((highlight) => highlight.page === pageNumber),
    [props.highlights, pageNumber]
  );

  const tags = useMemo(
    () =>
      own.map((highlight): MarkTag =>
        highlight.key === undefined
          ? { tinted: highlight.tinted !== false }
          : { key: highlight.key, tinted: highlight.tinted !== false }
      ),
    [own]
  );

  const ranges = useMemo(
    () =>
      taggedRanges(
        items,
        own.map((highlight) => highlight.quote)
      ),
    [items, own]
  );

  const rememberItems = useCallback(({ items: found }: TextContent) => {
    setItems(textItems(found));
  }, []);

  const renderText = useCallback(
    ({
      str,
      itemIndex,
    }: {
      readonly str: string;
      readonly itemIndex: number;
    }) => markedHtml(str, ranges.get(itemIndex) ?? [], tags),
    [ranges, tags]
  );

  const revealMark = useCallback(() => {
    const page = element.current;

    page
      ?.querySelector("mark:not([data-untinted])")
      ?.scrollIntoView({ block: "nearest" });

    onMarks(
      pageNumber,
      page === null
        ? []
        : Array.from(page.querySelectorAll<HTMLElement>("mark[data-highlight]"))
    );
  }, [onMarks, pageNumber]);

  return (
    <Page
      inputRef={element}
      pageNumber={props.pageNumber}
      width={props.width}
      loading={<PageSkeleton />}
      error={props.failure}
      renderAnnotationLayer={false}
      onGetTextSuccess={rememberItems}
      customTextRenderer={renderText}
      onRenderTextLayerSuccess={revealMark}
    />
  );
}

/** The union of each key's marks, measured against the viewer region. */
function placesOf(
  region: HTMLElement,
  marks: readonly HTMLElement[]
): MarkPlace[] {
  const origin = region.getBoundingClientRect();
  const byKey = new Map<string, MarkPlace>();

  for (const mark of marks) {
    const key = mark.dataset.highlight;
    const box = mark.getBoundingClientRect();

    if (key === undefined || box.height === 0) continue;

    const seen = byKey.get(key);
    const top = box.top - origin.top;
    const bottom = box.bottom - origin.top;
    const left = box.left - origin.left;
    const right = box.right - origin.left;

    byKey.set(key, {
      key,
      top: seen === undefined ? top : Math.min(seen.top, top),
      bottom: seen === undefined ? bottom : Math.max(seen.bottom, bottom),
      left: seen === undefined ? left : Math.min(seen.left, left),
      right: seen === undefined ? right : Math.max(seen.right, right),
    });
  }

  return [...byKey.values()];
}

/** The pages of one document at the width of their container, with the source text marked (R-38). */
export function DocumentViewer(props: DocumentViewerProps): ReactNode {
  const { onPlaces, onLoadError } = props;
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const pagePlaces = useRef(new Map<number, readonly MarkPlace[]>());

  const reportMarks = useCallback(
    (pageNumber: number, marks: readonly HTMLElement[]) => {
      const region = container.current;

      if (region === null || onPlaces === undefined) return;

      pagePlaces.current.set(pageNumber, placesOf(region, marks));
      onPlaces([...pagePlaces.current.values()].flat());
    },
    [onPlaces]
  );

  const failed = useCallback(() => onLoadError?.(), [onLoadError]);

  useEffect(() => {
    const element = container.current;

    if (element === null) return;

    // A hidden pane measures 0 (choice 14); keeping the last width keeps the drawn PDF, not a new load.
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0);

      setWidth((last) => (next === 0 ? last : next));
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={container}
      role="region"
      aria-label={props.label}
      data-document-viewer=""
      data-document-url={props.url}
      className="w-full min-w-0 [&_mark:not([data-untinted])]:bg-primary/25 [&_mark[data-untinted]]:bg-transparent [&_mark[data-untinted]]:text-transparent"
    >
      {width === 0 ? (
        <PageSkeleton />
      ) : (
        <Document
          file={props.url}
          suspense={false}
          loading={<PageSkeleton />}
          error={<LoadFailure url={props.url} />}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
          onLoadError={failed}
          onSourceError={failed}
          className="flex flex-col gap-4"
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <DocumentPage
              key={index + 1}
              pageNumber={index + 1}
              width={width}
              highlights={props.highlights}
              failure={<LoadFailure url={props.url} />}
              onMarks={reportMarks}
            />
          ))}
        </Document>
      )}
    </div>
  );
}
