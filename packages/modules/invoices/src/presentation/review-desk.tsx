"use client";

import { PageHeader } from "@genie/core/features/shell";
import { Badge, useMediaQuery } from "@genie/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  type CssVars,
  DeskCanvas,
  type DeskPin,
  PreviewFailed,
} from "./desk-canvas.tsx";
import { download, useFillHeight } from "./document-desk.tsx";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { ReviewCard } from "./review-card.tsx";
import { ReviewSaveBar } from "./review-form.tsx";
import type {
  ReviewItem,
  ReviewLayoutProps,
  ReviewModel,
} from "./review-model.ts";

export type ReviewStatus = "reading" | "blocked" | "ready";

export function reviewStatusOf(model: ReviewModel | null): ReviewStatus {
  if (model === null) return "reading";

  return model.blocker === null ? "ready" : "blocked";
}

function StatusPill(props: { readonly status: ReviewStatus }): ReactNode {
  switch (props.status) {
    case "reading":
      return <DocumentStatusBadge status="reading" />;
    case "blocked":
      return <DocumentStatusBadge status="needs-input" />;
    case "ready":
      return <Badge variant="success">Ready to save</Badge>;
  }
}

const PANEL_TITLE = "Before you save";

const READING_NOTE =
  "Reading the document. Fields that are not on the page, and the split of a payment, show here when the reading finishes.";

const ALL_FOUND =
  "Every field was found on the page. Select a card to see its line.";

const countText = (count: number) =>
  count === 1 ? "1 field" : `${count} fields`;

/** A group of cards in the panel, with its title and count. */
function CardGroup(props: {
  readonly title: string;
  readonly count?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section aria-label={props.title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.count === undefined ? null : (
          <span className="text-xs text-muted-foreground">{props.count}</span>
        )}
      </div>
      {props.children}
    </section>
  );
}

/**
 * The review as a document desk (R-38, czjw.98, prototype variant A with variant B's hover link):
 * from 1280 px each field read from the page is an editable card beside its line; the Before you
 * save panel holds the other fields, the split and Save. From 1024 px to 1279 px the panel lists
 * every card, with no leader line.
 */
export function ReviewDesk(props: ReviewLayoutProps): ReactNode {
  const { frame, model, revealRef } = props;
  const desk = useMediaQuery("(min-width: 1024px)", { noSsr: true });
  const wide = useMediaQuery("(min-width: 1280px)", { noSsr: true });
  const body = useRef<HTMLDivElement>(null);
  const fillHeight = useFillHeight(body, desk);
  // The first link lasts the page's life; only Try again replaces it.
  const [url, setUrl] = useState(props.fileUrl);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const items = model?.items ?? [];
  const pinsShown = wide && !failed;

  const pinned = pinsShown
    ? items.filter((item) => item.sources.length > 0)
    : [];

  const offPage = items.filter((item) => item.sources.length === 0);

  const onPage = pinsShown
    ? []
    : items.filter((item) => item.sources.length > 0);

  // The items are new on every render; the pins change only when their keys or quotes do, because
  // new pins draw the text layer again (`DeskCanvas` highlights).
  const pinText = JSON.stringify(
    pinned.map((item): DeskPin => ({ key: item.key, sources: item.sources }))
  );

  const pins = useMemo(
    (): readonly DeskPin[] => JSON.parse(pinText),
    [pinText]
  );

  useEffect(() => {
    revealRef.current = (blocker) => {
      if (blocker.key !== "split") setSelected(blocker.key);

      body.current
        ?.querySelector(
          blocker.key === "split"
            ? "[data-review-split]"
            : `[data-field="${blocker.key}"]`
        )
        ?.scrollIntoView({ block: "nearest" });

      if (blocker.focusId !== null)
        document.getElementById(blocker.focusId)?.focus();
    };
  });

  const cardOf = (item: ReviewItem): ReactNode => (
    // Focus inside a card selects it, so its line is boxed on the page.
    <div key={item.key} onFocus={() => setSelected(item.key)}>
      <ReviewCard
        item={item}
        selected={selected === item.key}
        hovered={hovered === item.key}
      />
    </div>
  );

  const downloadFresh = async () => {
    const fresh = await props.refreshUrl();

    if (fresh !== null) download(fresh, props.label);
  };

  const retry = async () => {
    const fresh = await props.refreshUrl();

    if (fresh === null) return;

    setUrl(fresh);
    setFailed(false);
    setAttempt((last) => last + 1);
  };

  const deskStyle: CssVars = {
    "--desk-height": fillHeight === undefined ? "auto" : `${fillHeight}px`,
  };

  return (
    <>
      <PageHeader
        title={frame.title}
        status={<StatusPill status={reviewStatusOf(model)} />}
        meta={frame.meta}
        breadcrumb={frame.breadcrumb}
        {...(frame.typeSelect === null
          ? {}
          : { secondaryActions: frame.typeSelect })}
      />
      <div
        ref={body}
        className="flex min-w-0 flex-col gap-4 lg:h-(--desk-height) lg:flex-row lg:gap-0"
        style={deskStyle}
      >
        {failed ? (
          <PreviewFailed
            onDownload={() => void downloadFresh()}
            onRetry={() => void retry()}
          />
        ) : (
          <DeskCanvas
            key={attempt}
            label={props.label}
            url={url}
            pins={pins}
            renderCard={(key) => {
              const item = items.find((candidate) => candidate.key === key);

              return item === undefined ? null : cardOf(item);
            }}
            wide={wide}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
            onLoadError={() => setFailed(true)}
            onDownload={() => void downloadFresh()}
            drawerButton={null}
          />
        )}
        <aside
          aria-label={PANEL_TITLE}
          className="flex shrink-0 flex-col rounded-xl border border-border bg-card lg:w-100 lg:rounded-none lg:border-y-0 lg:border-r-0"
        >
          <div className="flex h-12 shrink-0 items-center border-b border-border px-5">
            <h2 className="text-sm font-semibold">{PANEL_TITLE}</h2>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {frame.notice}
            {model === null ? (
              <p className="text-sm text-muted-foreground">{READING_NOTE}</p>
            ) : null}
            {onPage.length === 0 ? null : (
              <CardGroup title="On the page">{onPage.map(cardOf)}</CardGroup>
            )}
            {model === null ? null : offPage.length > 0 ? (
              <CardGroup
                title="Not on the page"
                count={countText(offPage.length)}
              >
                {offPage.map(cardOf)}
              </CardGroup>
            ) : pinsShown ? (
              <p className="text-sm text-muted-foreground">{ALL_FOUND}</p>
            ) : null}
            {model?.split == null ? null : (
              <div data-review-split="">{model.split}</div>
            )}
            {model?.notices}
          </div>
          <ReviewSaveBar
            reason={
              model === null
                ? "Wait for the reading to finish."
                : (model.blocker?.reason ?? null)
            }
            pending={model?.pending ?? false}
            label={model?.saveLabel ?? "Save"}
            discarding={props.discarding}
            onDiscard={props.onDiscard}
          />
        </aside>
      </div>
    </>
  );
}
