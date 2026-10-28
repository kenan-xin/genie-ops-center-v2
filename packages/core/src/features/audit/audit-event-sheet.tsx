"use client";

import {
  Button,
  CategoryChip,
  focusRing,
  LabelPill,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@genie/ui";
import { useState } from "react";
import type { JSX, ReactNode } from "react";

import {
  eventCategory,
  fmtExact,
  formatMetaValue,
  humanize,
  looksLikeCode,
  relativeTime,
} from "./helpers.ts";
import { CheckIcon, CopyIcon, ExternalLinkIcon, SystemIcon } from "./icons.tsx";
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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </h2>
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
export function AuditEventSheet(props: AuditEventSheetProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  // The host drops the event in the same render that closes the sheet; keep the last one so the
  // sheet can run its exit instead of unmounting.
  const [shown, setShown] = useState(props.event);

  if (props.event !== null && props.event !== shown) setShown(props.event);

  return (
    <Sheet
      open={props.event !== null}
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      {shown === null ? null : (
        <SheetContent>
          <SheetEventBody
            event={shown}
            timeZone={props.timeZone}
            now={props.now}
            copied={copied}
            onCopied={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            onOpenTarget={props.onOpenTarget}
            onCopyEventId={props.onCopyEventId}
          />
        </SheetContent>
      )}
    </Sheet>
  );
}

function SheetEventBody(props: {
  readonly event: AuditEvent;
  readonly timeZone: string;
  readonly now: Date;
  readonly copied: boolean;
  readonly onCopied: () => void;
  readonly onOpenTarget: AuditEventSheetProps["onOpenTarget"];
  readonly onCopyEventId: AuditEventSheetProps["onCopyEventId"];
}): JSX.Element {
  const { event, copied } = props;
  const entries = Object.entries(event.metadata);

  const copy = () => {
    navigator.clipboard?.writeText(event.id).catch(() => undefined);
    props.onCopyEventId?.(event.id);
    props.onCopied();
  };

  return (
    <>
      <SheetHeader>
        {/* The action chip is the visible heading; the title only names the dialog. */}
        <SheetTitle className="sr-only">Audit event</SheetTitle>
        <div>
          <CategoryChip category={eventCategory(event.action)}>
            {event.action}
          </CategoryChip>
        </div>
      </SheetHeader>

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
            {relativeTime(event.occurredAt, props.now, props.timeZone)} · shown
            in {props.timeZone.replace("_", " ")}
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
                <Button
                  variant="link"
                  size="sm"
                  className="shrink-0"
                  onClick={() => props.onOpenTarget?.(event.targetPath ?? "")}
                >
                  Open
                  <ExternalLinkIcon className="size-4" />
                </Button>
              ) : event.targetExists ? (
                <span title="This record has no page you can open from here.">
                  <LabelPill>No link</LabelPill>
                </span>
              ) : (
                <LabelPill>Removed</LabelPill>
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
              className={`w-fit cursor-pointer select-none rounded-lg text-sm font-medium text-primary dark:text-brand-on-dark hover:underline ${focusRing}`}
            >
              <span className="group-open:hidden">Show JSON</span>
              <span className="hidden group-open:inline">Hide JSON</span>
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
              {JSON.stringify(event, null, 2)}
            </pre>
          </details>
        </SheetSection>
      </div>

      <SheetFooter>
        <div className="flex items-center justify-between gap-3">
          <p
            className="min-w-0 truncate font-mono text-xs text-muted-foreground"
            title={event.id}
          >
            Event id {event.id}
          </p>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={copy}>
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
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
