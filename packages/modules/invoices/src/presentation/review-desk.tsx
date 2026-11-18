"use client";

import { PageHeader } from "@genie/core/features/shell";
import { Badge } from "@genie/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  type CssVars,
  DeskCanvas,
  type DeskPin,
  PreviewFailed,
} from "./desk-canvas.tsx";
import { download, useFillHeight } from "./document-desk.tsx";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { ReviewFormColumn } from "./review-form-column.tsx";
import { ReviewSaveBar } from "./review-form.tsx";
import type {
  ReviewFrame,
  ReviewLayoutProps,
  ReviewModel,
} from "./review-model.ts";

export type ReviewStatus = "reading" | "blocked" | "ready" | "saved";

export function reviewStatusOf(
  model: ReviewModel | null,
  frame: ReviewFrame
): ReviewStatus {
  if (frame.saved !== null) return "saved";

  if (model === null || frame.sweep) return "reading";

  return model.blocker === null ? "ready" : "blocked";
}

export function StatusPill(props: {
  readonly status: ReviewStatus;
}): ReactNode {
  switch (props.status) {
    case "reading":
      return <DocumentStatusBadge status="reading" />;
    case "blocked":
      return <DocumentStatusBadge status="needs-input" />;
    case "ready":
      return <Badge variant="success">Ready to save</Badge>;
    case "saved":
      return <DocumentStatusBadge status="saved" />;
  }
}

/** The file of the page: its first link, a failed load, and Download and Try again with a fresh link. */
export function usePageFile(
  props: Pick<ReviewLayoutProps, "fileUrl" | "refreshUrl" | "label">
) {
  // The first link lasts the page's life; only Try again replaces it.
  const [url, setUrl] = useState(props.fileUrl);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // A layout switch (the agent panel docks) mounts this hook again on the first link, which may
  // have expired, so the first failed load asks once for a fresh link before Preview failed.
  const refreshed = useRef(false);

  const fail = async () => {
    if (refreshed.current) {
      setFailed(true);

      return;
    }

    refreshed.current = true;

    const fresh = await props.refreshUrl().catch(() => null);

    if (fresh === null) {
      setFailed(true);

      return;
    }

    setUrl(fresh);
    setAttempt((last) => last + 1);
  };

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

  return {
    url,
    attempt,
    failed,
    fail: () => void fail(),
    download: () => void downloadFresh(),
    retry: () => void retry(),
  };
}

/**
 * The review as one form beside the document (R-38, czjw.187): the page with every quoted field
 * marked on it, and the Fields region with Type, the sections, the split and Save, which names
 * and focuses what blocks it. Below `DESK_FROM` the workspace shows the pager instead.
 */
export function ReviewDesk(props: ReviewLayoutProps): ReactNode {
  const { frame, model, revealRef } = props;
  const body = useRef<HTMLDivElement>(null);
  const fillHeight = useFillHeight(body, true);
  const file = usePageFile(props);
  const { failed } = file;
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // The sweep plays on the page, so a page that did not load ends it at once.
  const sweeping = frame.sweep && !failed;

  // While the job reads and while the sweep plays, the form waits (P09-2).
  const reading = model === null || sweeping;

  useEffect(() => {
    if (frame.sweep && failed) frame.onSweepEnd();
  }, [frame, failed]);

  const items = model?.items ?? [];

  // The items are new on every render; the pins change only when their keys or quotes do, because
  // new pins draw the text layer again (`DeskCanvas` highlights).
  const pinText = JSON.stringify(
    items
      .filter((item) => item.sources.length > 0)
      .map((item): DeskPin => ({ key: item.key, sources: item.sources }))
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

  const deskStyle: CssVars = {
    "--desk-height": fillHeight === undefined ? "auto" : `${fillHeight}px`,
  };

  return (
    <>
      <PageHeader
        title={frame.title}
        status={<StatusPill status={reviewStatusOf(model, frame)} />}
        meta={frame.meta}
        breadcrumb={frame.breadcrumb}
      />
      <div
        ref={body}
        className="flex h-(--desk-height) min-w-0 flex-row"
        style={deskStyle}
      >
        {failed ? (
          <PreviewFailed
            wide={false}
            onDownload={file.download}
            onRetry={file.retry}
          />
        ) : (
          <DeskCanvas
            key={file.attempt}
            label={props.label}
            url={file.url}
            pins={pins}
            renderCard={() => null}
            wide={false}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
            onLoadError={file.fail}
            onDownload={file.download}
            drawerButton={null}
            scan={model === null ? "loop" : sweeping ? "sweep" : null}
            onSweepEnd={frame.onSweepEnd}
          />
        )}
        <section
          aria-label="Fields"
          className="flex w-100 shrink-0 flex-col border-l border-border bg-card"
        >
          <div
            data-review-scroll=""
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5"
          >
            <ReviewFormColumn
              frame={frame}
              model={model}
              reading={reading}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          {frame.saved === null ? (
            <ReviewSaveBar
              reason={
                reading
                  ? "Wait for the reading to finish."
                  : (model.blocker?.reason ?? null)
              }
              pending={model?.pending ?? false}
              label={model?.saveLabel ?? "Save"}
              discarding={props.discarding}
              onDiscard={props.onDiscard}
            />
          ) : null}
        </section>
      </div>
    </>
  );
}
