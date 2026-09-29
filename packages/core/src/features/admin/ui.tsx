import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import { CloseIcon, HelpIcon } from "./icons.tsx";

/** The one focus ring (design tokens). */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background";

export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground motion-safe:transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-input bg-white px-3 text-sm font-semibold text-foreground motion-safe:transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card ${focusRing}`;

export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-destructive px-3 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const btnGhost = `inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground motion-safe:transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const inputClass = `h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground dark:bg-card ${focusRing}`;

export type PillTone = "neutral" | "success" | "warning" | "danger" | "info";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-primary/10 text-primary",
  warning: "bg-muted text-foreground",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
};

export function Pill(props: {
  readonly tone?: PillTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        PILL_TONE[props.tone ?? "neutral"]
      }`}
    >
      {props.children}
    </span>
  );
}

/**
 * The design system's confirm dialog: the title names the object, one sentence of consequence,
 * Cancel focused, danger tone. A dialog with no `onConfirm` is informational only.
 */
export function ConfirmDialog(props: {
  readonly title: string;
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-card"
      >
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {props.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {props.consequence}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={props.onCancel}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className={props.danger === false ? btnPrimary : btnDanger}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A right slide-over panel; full-height on small screens (the inspector). */
export function SlideOver(props: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-120 flex-col overflow-y-auto border-l border-input bg-white shadow-xl dark:bg-card"
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <h2 className="text-lg font-semibold text-foreground">{props.title}</h2>
        <button
          type="button"
          className={btnGhost}
          aria-label="Close"
          onClick={props.onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex-1 px-4 pb-6">{props.children}</div>
    </div>
  );
}

/** The design system's contextual help: a collapsed disclosure that opens on click or key. */
export function HelpDisclosure(props: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="inline-block">
      <button
        type="button"
        className={btnGhost}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <HelpIcon />
        {props.label}
      </button>
      {open ? (
        <div className="mt-2 max-w-prose rounded-lg border border-input bg-muted p-3 text-sm text-foreground">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

export function Field(props: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">
        {props.label}
      </span>
      {props.children}
      {props.hint === undefined ? null : (
        <span className="mt-1 block text-xs text-muted-foreground">
          {props.hint}
        </span>
      )}
    </label>
  );
}
