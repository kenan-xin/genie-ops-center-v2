"use client";

import { PageHeader } from "@genie/core/features/shell";
import { Button, useMediaQuery } from "@genie/ui";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  FileTextIcon,
  FileXIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { type CssVars, PreviewFailed } from "./desk-canvas.tsx";
import { LazyDocumentViewer } from "./document-viewer-lazy.tsx";
import type { MarkPlace, ViewerHighlight } from "./document-viewer.tsx";
import { ReviewCard } from "./review-card.tsx";
import { reviewStatusOf, StatusPill, usePageFile } from "./review-desk.tsx";
import { OriginTag } from "./review-fields.tsx";
import { ReviewSaveBar } from "./review-form.tsx";
import type {
  ReviewItem,
  ReviewLayoutProps,
  ReviewModel,
} from "./review-model.ts";

/** One step of the pager: a field, or the split and the summary, which have no item. */
type Step = { readonly key: string; readonly item: ReviewItem | null };

/**
 * The steps in list order, so a step never moves when the places arrive (P09-12): the fields on
 * the page, the other fields, the split of a payment, then the summary.
 */
function stepsOf(model: ReviewModel | null): readonly Step[] {
  if (model === null) return [];

  const items = [
    ...model.items.filter((item) => item.sources.length > 0),
    ...model.items.filter((item) => item.sources.length === 0),
  ];

  return [
    ...items.map((item) => ({ key: item.key, item })),
    ...(model.split === null ? [] : [{ key: "split", item: null }]),
    { key: "summary", item: null },
  ];
}

/** The next button keeps an edit, asks to continue past a field to fill, or confirms a read one. */
function nextLabelOf(item: ReviewItem | null): string {
  switch (item?.tag) {
    case "corrected":
    case "entered":
      return "Keep and continue";
    case "needs-input":
    case "check-this":
      return "Continue";
    default:
      return "Looks right";
  }
}

/** Where the value of a field comes from, under its card. `found` is null until the page is read. */
function quoteLineOf(
  item: ReviewItem,
  found: boolean | null,
  unread: boolean
): string {
  const [first] = item.sources;

  if (first !== undefined && found !== false) {
    const quotes = item.sources.map((source) => `“${source.quote}”`);

    return `On page ${first.page}: ${quotes.join(" · ")}`;
  }

  if (first !== undefined || item.tag === "check-this")
    return "No matching line was found on the page.";

  return unread
    ? "The document was not read. Fill in this field by hand."
    : "This is not stated on the document.";
}

// The page is wider than the lens, so its text reads larger and the margins fall outside.
const LENS_PAGE: CssVars = { "--lens-page-width": "114%" };

/**
 * The page at 1.14 times the lens width, scrolled so that the current line sits in the middle,
 * with a ring around it (prototype variant C). The person never scrolls the lens.
 */
function PageLens(props: {
  readonly url: string;
  readonly label: string;
  readonly highlights: readonly ViewerHighlight[];
  /** The line to show; null shows the top of the page. */
  readonly place: MarkPlace | null;
  readonly chip: ReactNode;
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
        className="h-68 overflow-hidden"
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
        <span className="absolute top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-semibold whitespace-nowrap text-background shadow-md [&_svg]:size-3.5">
          {props.chip}
        </span>
      )}
    </div>
  );
}

/** The fields with their values and tags, and the split of a payment, before Save. */
function Summary(props: { readonly model: ReviewModel }): ReactNode {
  const { items, splitSummary } = props.model;

  return (
    <dl
      data-review-summary=""
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
    >
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs font-semibold text-muted-foreground">
            {item.label}
          </dt>
          <dd className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">{item.display}</span>
            <OriginTag tag={item.tag} />
          </dd>
        </div>
      ))}
      {splitSummary === null ? null : (
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs font-semibold text-muted-foreground">Split</dt>
          <dd className="text-sm">
            {`Linked ${splitSummary.linked} · ${splitSummary.count === 1 ? "1 invoice" : `${splitSummary.count} invoices`}`}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The review on a phone, one field at a time (R-38, czjw.98, prototype variant C): the source
 * line of the field in a lens, its card, then the split as its own step, then a summary with Save.
 */
export function ReviewPager(props: ReviewLayoutProps): ReactNode {
  const { frame, model, revealRef } = props;
  const file = usePageFile(props);
  const [places, setPlaces] = useState<readonly MarkPlace[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  // The control to focus once the step that holds it renders (a blocked Save, a held split).
  const [focusId, setFocusId] = useState<string | null>(null);

  const steps = stepsOf(model);
  const found = steps.findIndex((step) => step.key === at);
  const index = found === -1 ? 0 : found;
  const step = steps[index];

  // The pager plays no sweep, so it ends the sweep at once.
  const { sweep, onSweepEnd } = frame;

  useEffect(() => {
    if (sweep) onSweepEnd();
  }, [sweep, onSweepEnd]);

  useEffect(() => {
    revealRef.current = (blocker) => {
      setAt(blocker.key);
      setFocusId(blocker.focusId);
    };
  });

  useEffect(() => {
    if (focusId === null) return;

    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId, at]);

  // New highlights draw the text layer again, so they change only when a key or a quote does.
  const highlightText = JSON.stringify(
    (model?.items ?? []).flatMap((item) =>
      item.sources.map((source): ViewerHighlight => ({
        page: source.page,
        quote: source.quote,
        key: item.key,
        tinted: false,
      }))
    )
  );

  const highlights = useMemo(
    (): readonly ViewerHighlight[] => JSON.parse(highlightText),
    [highlightText]
  );

  const item = step?.item ?? null;

  // The split step shows the line that names the invoices.
  const target = item?.key ?? (step?.key === "split" ? "invoiceNumbers" : null);

  const place =
    target === null
      ? null
      : (places?.find((candidate) => candidate.key === target) ?? null);

  const lost =
    item !== null &&
    (item.sources.length === 0 || (places !== null && place === null));

  const go = (to: number) => setAt(steps[to]?.key ?? null);

  const held = step?.key === "split" && model?.blocker?.key === "split";

  const pressNext = () => {
    if (held) {
      model?.submit();

      return;
    }

    go(index + 1);
  };

  const body = (() => {
    if (model === null || step === undefined) return null;

    if (item !== null) {
      return (
        <>
          <ReviewCard item={item} size="step" />
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileTextIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">
              {quoteLineOf(
                item,
                item.sources.length === 0
                  ? false
                  : places === null
                    ? null
                    : place !== null,
                props.unread
              )}
            </span>
          </p>
        </>
      );
    }

    if (step.key === "split")
      return <div data-review-split="">{model.split}</div>;

    return (
      <>
        <h2 className="text-lg font-semibold">Check and save</h2>
        {frame.typeSelect}
        <Summary model={model} />
        {model.notices}
      </>
    );
  })();

  return (
    <>
      <PageHeader
        title={frame.title}
        status={<StatusPill status={reviewStatusOf(model, frame)} />}
        breadcrumb={frame.breadcrumb}
      />
      <div className="flex min-w-0 flex-col gap-4">
        {file.failed ? (
          <PreviewFailed onDownload={file.download} onRetry={file.retry} />
        ) : (
          <PageLens
            key={file.attempt}
            url={file.url}
            label={props.label}
            highlights={highlights}
            place={place}
            chip={
              lost ? (
                <>
                  <FileXIcon aria-hidden />
                  Not found on the page
                </>
              ) : null
            }
            onPlaces={setPlaces}
            onLoadError={file.fail}
          />
        )}
        {step === undefined ? null : (
          <section className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-muted-foreground">
              {`Step ${index + 1} of ${steps.length}`}
            </p>
            {frame.notice}
            {body}
          </section>
        )}
      </div>
      {model === null || step === undefined ? null : step.key === "summary" ? (
        <ReviewSaveBar
          reason={model.blocker?.reason ?? null}
          pending={model.pending}
          label={model.saveLabel}
          discarding={props.discarding}
          onDiscard={props.onDiscard}
        />
      ) : (
        <div
          data-shell-bottom-bar=""
          className="z-10 flex items-center gap-2 border-t border-border bg-card px-4 py-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:-bottom-8"
        >
          {index === 0 ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous field"
              onClick={() => go(index - 1)}
            >
              <ChevronLeftIcon />
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="flex-1"
            aria-disabled={held ? true : undefined}
            onClick={pressNext}
          >
            {nextLabelOf(item)}
            <ArrowRightIcon aria-hidden />
          </Button>
        </div>
      )}
    </>
  );
}
