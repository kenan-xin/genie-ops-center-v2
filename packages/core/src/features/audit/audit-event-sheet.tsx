"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";

import {
  btnGhost,
  focusRing,
  fmtExact,
  formatMetaValue,
  humanize,
  looksLikeCode,
  relativeTime,
} from "./helpers.ts";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExternalLinkIcon,
  SystemIcon,
} from "./icons.tsx";
import type { AuditActor, AuditEvent } from "./types.ts";

export type AuditEventSheetProps = {
  readonly event: AuditEvent | null;
  readonly timeZone: string;
  readonly now: Date;
  readonly onClose: () => void;
  /** Follows the path the server supplied on the event. The sheet never invents a destination. */
  readonly onOpenTarget?: ((path: string) => void) | undefined;
  readonly onCopyEventId?: ((eventId: string) => void) | undefined;
};

function SheetSection(props: {
  readonly title: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function SheetAvatar(props: {
  readonly actor: AuditActor | null;
}): JSX.Element {
  if (props.actor === null) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground text-muted-foreground border-muted-foreground">
        <SystemIcon className="size-4" />
      </span>
    );
  }

  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        props.actor.anonymized
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground"
      }`}
    >
      {props.actor.anonymized
        ? "?"
        : props.actor.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("")}
    </span>
  );
}

/**
 * The detail sheet (design: 480px on desktop, full-height on phones). It shows the actor, the
 * exact time, the target with an Open link only when the server supplied an authorized path, the
 * summary, the metadata, and the raw event under Show JSON. Nothing here writes.
 */
export function AuditEventSheet(
  props: AuditEventSheetProps
): JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(props.onClose);
  const event = props.event;

  close.current = props.onClose;

  useEffect(() => {
    if (event === null) return;

    closeRef.current?.focus();

    const onKey = (keyboard: KeyboardEvent) => {
      if (keyboard.key === "Escape") close.current();
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [event]);

  if (event === null) return null;

  const entries = Object.entries(event.metadata);

  const copy = () => {
    navigator.clipboard?.writeText(event.id).catch(() => undefined);
    props.onCopyEventId?.(event.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={props.onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Audit event"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:inset-y-3 sm:right-3 sm:w-120 sm:rounded-xl sm:border sm:border-border bg-card "
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 ">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground text-foreground">
            {event.action}
          </span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={props.onClose}
            className={`${btnGhost} size-11 justify-center px-0 text-muted-foreground sm:size-8`}
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <SheetSection title="Actor">
            <div className="flex items-center gap-3">
              <SheetAvatar actor={event.actor} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {event.actor?.name ?? "System"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {event.actor === null
                    ? "A job, provisioning, or the operator command line."
                    : event.actor.anonymized
                      ? "Personal data erased. Events kept under an anonymized id."
                      : event.actor.email}
                </p>
              </div>
            </div>
          </SheetSection>

          <SheetSection title="When">
            <p className="text-sm font-medium">
              {fmtExact(event.occurredAt, props.timeZone)}
            </p>
            <p className="text-xs text-muted-foreground">
              {relativeTime(event.occurredAt, props.now, props.timeZone)} ·
              shown in {props.timeZone.replace("_", " ")}
            </p>
          </SheetSection>

          <SheetSection title="Target">
            {event.targetType === "" ? (
              <p className="text-sm text-muted-foreground">
                This event names no target.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {humanize(event.targetType)}
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {event.targetLabel}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {event.targetId}
                  </p>
                </div>
                {event.targetPath !== null ? (
                  <button
                    type="button"
                    className={`${btnGhost} shrink-0 text-primary`}
                    onClick={() => props.onOpenTarget?.(event.targetPath ?? "")}
                  >
                    Open
                    <ExternalLinkIcon className="size-4" />
                  </button>
                ) : event.targetExists ? (
                  <span
                    title="This record has no page you can open from here."
                    className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground text-foreground"
                  >
                    No link
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground text-foreground">
                    Removed
                  </span>
                )}
              </div>
            )}
          </SheetSection>

          <SheetSection title="Summary">
            <p className="text-sm leading-relaxed text-foreground text-foreground">
              {event.summary}
            </p>
          </SheetSection>

          <SheetSection title="Details">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This event carries no extra details.
              </p>
            ) : (
              <dl className="divide-y divide-border">
                {entries.map(([key, value]) => (
                  <div key={key} className="flex gap-3 py-2 text-sm">
                    <dt className="w-36 shrink-0 break-words text-muted-foreground">
                      {humanize(
                        key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
                      )}
                    </dt>
                    <dd
                      className={`min-w-0 flex-1 break-words ${
                        looksLikeCode(value) ? "font-mono text-xs" : ""
                      }`}
                    >
                      {formatMetaValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <details className="group mt-1">
              <summary
                className={`w-fit cursor-pointer select-none rounded-lg text-sm font-medium text-primary hover:underline text-primary ${focusRing}`}
              >
                <span className="group-open:hidden">Show JSON</span>
                <span className="hidden group-open:inline">Hide JSON</span>
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground bg-card text-foreground">
                {JSON.stringify(event, null, 2)}
              </pre>
            </details>
          </SheetSection>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 ">
          <p
            className="min-w-0 truncate font-mono text-xs text-muted-foreground"
            title={event.id}
          >
            Event id {event.id}
          </p>
          <button
            type="button"
            className={`${btnGhost} shrink-0`}
            onClick={copy}
          >
            {copied ? (
              <>
                <CheckIcon className="size-4 text-primary" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
