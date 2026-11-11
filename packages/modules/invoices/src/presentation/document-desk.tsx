"use client";

import { Button, useMediaQuery } from "@genie/ui";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PanelRightOpenIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  type CssVars,
  DeskCanvas,
  type DeskField,
  FieldCard,
  NoDocument,
  PreviewFailed,
} from "./desk-canvas.tsx";
import { DESK_PINS_FROM, useWidth } from "./desk-width.ts";

export type { DeskField } from "./desk-canvas.tsx";

/**
 * Where the record's links and history show: the drawer on a wide desk (`DESK_PINS_FROM` of its
 * own width, from a 1024 px viewport), the sheet otherwise.
 */
export type DeskPlace = "drawer" | "sheet";

export type DocumentDeskProps = {
  readonly kind: "invoice" | "payment";
  /** The record's number or reference, for example "INV-2026-09-03". */
  readonly label: string;
  readonly documentUrl: string | null;
  /** Asks the record again for a fresh file link, because a link lives 5 minutes (DK8). */
  readonly refreshUrl: () => Promise<string | null>;
  readonly fields: readonly DeskField[];
  /** The page header, at every width. */
  readonly header: ReactNode;
  /**
   * What the header shows from `lg` (the meta line and its actions), at the top of the opened
   * sheet below it, so that a phone shows the page first (variant C).
   */
  readonly sheetHeader?: ReactNode;
  /** The figures: under the header on a wide desk, in the sheet on a narrower one. */
  readonly figures: ReactNode;
  /** What the closed sheet shows: the status, a caption and the lead amount. */
  readonly peek: {
    readonly status: ReactNode;
    readonly caption: string;
    readonly amount: string;
  };
  /** The links and the history, in the drawer or in the sheet. */
  readonly side: (place: DeskPlace) => ReactNode;
};

/**
 * The canvas and drawer fill the window below their top edge on a wide desk, each with its own
 * scroll.
 */
export function useFillHeight(
  element: RefObject<HTMLElement | null>,
  wide: boolean
): number | undefined {
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    if (!wide) {
      setHeight(undefined);

      return;
    }

    const measure = () => {
      const top = element.current?.getBoundingClientRect().top ?? 0;

      setHeight(Math.max(480, Math.floor(window.innerHeight - top - 16)));
    };

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [element, wide]);

  return height;
}

/** Opens a file link as a download, without leaving the page. */
export function download(url: string, fileName: string): void {
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * The record page with its document in the page (R-38a, prototype invoice record variant C). On a
 * wide desk (its own width, so the docked agent panel narrows it, P16g-4, and a viewport of at
 * least 1024 px, P16g-13) the page sits on a canvas with each read field pinned beside its line,
 * and the links and history in a drawer. Otherwise the page comes first, and the record opens in
 * a bottom sheet.
 */
export function DocumentDesk(props: DocumentDeskProps): ReactNode {
  const { kind, label, side } = props;
  const root = useRef<HTMLDivElement>(null);
  // Below 1024 px the header hides its meta and actions (`compactBelowLg`) and only the sheet
  // shows them, so a desk wide enough to pin still keeps the sheet there (P16g-13).
  const lg = useMediaQuery("(min-width: 1024px)", {});
  const width = useWidth(root) ?? 0;
  const wide = lg && width >= DESK_PINS_FROM;
  const body = useRef<HTMLDivElement>(null);
  const fillHeight = useFillHeight(body, wide);
  const sheetBody = useId();
  // The first link lasts the page's life, so a refetch never loads the PDF again (DK8).
  const [url, setUrl] = useState(props.documentUrl);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sideName =
    kind === "invoice" ? "Payments and history" : "Invoices and history";

  const fileName = `${label}.pdf`;

  // Memoised: new pins would draw the text layer again (`DeskCanvas` highlights).
  const pins = useMemo(
    () =>
      props.fields.map((field) => ({
        key: field.key,
        sources: field.source === null ? [] : [field.source],
      })),
    [props.fields]
  );

  const deskStyle: CssVars = {
    "--desk-height": fillHeight === undefined ? "auto" : `${fillHeight}px`,
    "--desk-sheet-height": "86dvh",
  };

  const canHide = url !== null && !failed;
  const drawerShown = drawerOpen || !canHide;

  const downloadFresh = async () => {
    const fresh = await props.refreshUrl();

    if (fresh !== null) download(fresh, fileName);
  };

  const retry = async () => {
    const fresh = await props.refreshUrl();

    if (fresh === null) return;

    setUrl(fresh);
    setFailed(false);
    setAttempt((last) => last + 1);
  };

  let canvas: ReactNode;

  if (url === null) {
    canvas = <NoDocument kind={kind} fields={props.fields} wide={wide} />;
  } else if (failed) {
    canvas = (
      <PreviewFailed
        fields={props.fields}
        wide={wide}
        onDownload={() => void downloadFresh()}
        onRetry={() => void retry()}
      />
    );
  } else {
    canvas = (
      <DeskCanvas
        key={attempt}
        label={label}
        url={url}
        pins={pins}
        renderCard={(key) => {
          const field = props.fields.find((item) => item.key === key);

          return field === undefined ? null : <FieldCard field={field} />;
        }}
        wide={wide}
        onLoadError={() => setFailed(true)}
        onDownload={() => void downloadFresh()}
        drawerButton={
          !wide || drawerShown ? null : (
            <>
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              <Button
                variant="secondary"
                size="sm"
                aria-expanded="false"
                onClick={() => setDrawerOpen(true)}
              >
                <PanelRightOpenIcon />
                {sideName}
              </Button>
            </>
          )
        }
      />
    );
  }

  return (
    <div ref={root} className="flex flex-col" style={deskStyle}>
      {props.header}
      {wide ? <div className="mb-4">{props.figures}</div> : null}
      <div
        ref={body}
        className={
          wide ? "flex h-(--desk-height) min-w-0" : "flex min-w-0 gap-4"
        }
      >
        {canvas}
        {wide && drawerShown ? (
          <aside
            aria-label={sideName}
            className="flex w-100 shrink-0 flex-col border-l border-border bg-card"
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-5">
              <b className="flex-1 text-sm">{sideName}</b>
              {canHide ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hide ${sideName.toLowerCase()}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 pt-5 pb-12">
              {side("drawer")}
            </div>
          </aside>
        ) : null}
      </div>
      {wide ? null : (
        <section
          aria-label={`Details of ${label}`}
          data-shell-bottom-bar=""
          className="z-20 flex max-h-(--desk-sheet-height) flex-col rounded-t-2xl bg-card shadow-lg ring-1 ring-border max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:-bottom-8"
        >
          <div className="flex shrink-0 flex-col gap-2 px-4 pt-2 pb-3">
            <span
              aria-hidden
              className="h-1 w-9 self-center rounded-full bg-border"
            />
            <span className="flex items-center gap-2">
              <b className="tabular-nums">{label}</b>
              {props.peek.status}
            </span>
            <span className="flex items-end justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  {props.peek.caption}
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {props.peek.amount}
                </span>
              </span>
              <Button
                variant="ghost"
                size="lg"
                aria-expanded={sheetOpen}
                aria-controls={sheetBody}
                onClick={() => setSheetOpen((open) => !open)}
              >
                {sheetOpen ? "Hide details" : "Details"}
                {sheetOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </Button>
            </span>
          </div>
          <div
            id={sheetBody}
            hidden={!sheetOpen}
            // A scroll area takes keyboard focus, so a keyboard can scroll it (axe scrollable-region-focusable).
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-t border-border px-4 pt-4 pb-6"
          >
            {props.sheetHeader === undefined ? null : (
              <div className="flex flex-col items-start gap-3 lg:hidden">
                {props.sheetHeader}
              </div>
            )}
            {props.figures}
            <section aria-label="Fields" className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">Fields</h2>
              {props.fields.map((field) => (
                <FieldCard key={field.key} field={field} />
              ))}
            </section>
            {side("sheet")}
          </div>
        </section>
      )}
    </div>
  );
}
