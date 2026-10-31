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

import { markedHtml, quoteRanges, type TextItem } from "./quote-marks.ts";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// shortcut: no wasmUrl is set, so pdf.js decoders that need WASM, for example JPEG 2000
// images, do not run. Set wasmUrl when a document that needs one must draw.

export type ViewerHighlight = { readonly page: number; readonly quote: string };

export type DocumentViewerProps = {
  readonly url: string;
  /** The label of the document; it names the viewer region for assistive technology. */
  readonly label: string;
  readonly highlights: readonly ViewerHighlight[];
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
};

/** One page at the measured width, with the quotes of its highlights marked in its text layer. */
function DocumentPage(props: PageProps) {
  const element = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<readonly TextItem[]>([]);

  const quotes = useMemo(
    () =>
      props.highlights
        .filter((highlight) => highlight.page === props.pageNumber)
        .map((highlight) => highlight.quote),
    [props.highlights, props.pageNumber]
  );

  const ranges = useMemo(() => quoteRanges(items, quotes), [items, quotes]);

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
    }) => markedHtml(str, ranges.get(itemIndex) ?? []),
    [ranges]
  );

  const revealMark = useCallback(() => {
    element.current
      ?.querySelector("mark")
      ?.scrollIntoView({ block: "nearest" });
  }, []);

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

/** The pages of one document at the width of their container, with the source text marked (R-38). */
export function DocumentViewer(props: DocumentViewerProps): ReactNode {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const element = container.current;

    if (element === null) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry?.contentRect.width ?? 0));
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
      className="w-full min-w-0 [&_mark]:bg-primary/25"
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
          className="flex flex-col gap-4"
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <DocumentPage
              key={index + 1}
              pageNumber={index + 1}
              width={width}
              highlights={props.highlights}
              failure={<LoadFailure url={props.url} />}
            />
          ))}
        </Document>
      )}
    </div>
  );
}
