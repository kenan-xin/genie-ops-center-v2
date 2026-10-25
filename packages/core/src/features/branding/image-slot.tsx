"use client";

import { Button, FieldError, focusRing, Spinner, StatusPill } from "@genie/ui";
import { UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";

import type {
  BrandingImageView,
  ScanStatus,
} from "../../services/branding/schemas.ts";

const ACCEPT =
  ".png,.svg,.webp,.ico,image/png,image/svg+xml,image/webp,image/x-icon,image/vnd.microsoft.icon";

const SCAN: Record<
  ScanStatus,
  { tone: "neutral" | "success" | "danger"; label: string }
> = {
  pending: { tone: "neutral", label: "Scanning" },
  clean: { tone: "success", label: "Clean" },
  infected: { tone: "danger", label: "Infected" },
  skipped: { tone: "neutral", label: "Skipped" },
};

export type SlotState = {
  readonly uploading?: string;
  readonly error?: string;
};

function sizeText(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * One branding image (R-49, R-50): a drop zone on a native file input until an image is set, then
 * the image with Replace, Remove and its scan status. A Scanning image is not shown, and an
 * Infected one shows the refusal alert. No library drop zone fits Base UI without a second
 * primitive, so this is a native input that the drop zone button opens.
 */
export function ImageSlot(props: {
  readonly label: string;
  readonly recommended: string;
  readonly image: BrandingImageView | undefined;
  readonly state: SlotState;
  /** A refused Publish's message for this slot, cleared when the image changes. */
  readonly issue?: string | undefined;
  readonly onFile: (file: File) => void;
  readonly onRemove: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { image, state } = props;
  const error = state.error ?? props.issue;

  function choose(files: FileList | null) {
    const file = files?.[0];

    if (file !== undefined) props.onFile(file);
  }

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="flex flex-col gap-2"
    >
      <p id={`${id}-label`} className="text-sm font-medium">
        {props.label}
      </p>
      <input
        ref={input}
        id={`${id}-input`}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        // The drop zone button below is the one tab stop; it opens this input.
        tabIndex={-1}
        aria-label={`Upload a file for ${props.label}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = "";
        }}
      />
      {state.uploading === undefined ? null : (
        <p className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Spinner label="Uploading" />
          Uploading {state.uploading}
        </p>
      )}
      {state.uploading !== undefined ? null : image === undefined ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm ${dragging ? "bg-muted" : ""} ${focusRing}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files);
          }}
        >
          <UploadCloud
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          <span>
            Drop an image or{" "}
            <span className="font-semibold text-primary dark:text-brand-on-dark">
              browse
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            PNG, SVG, WebP or ICO, up to 1 MB. {props.recommended}.
          </span>
          <span className="text-xs text-muted-foreground">
            SVG files are cleaned on upload. Scan status stays Skipped until a
            scanner exists.
          </span>
        </button>
      ) : image.scanStatus === "infected" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive p-3 text-sm"
        >
          <span className="flex-1">
            This file was refused by the malware scan.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => input.current?.click()}
          >
            Choose another file
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onRemove}>
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          {image.url === null || image.url === failedUrl ? null : (
            <img
              onError={() => setFailedUrl(image.url)}
              src={image.url}
              alt=""
              className="size-12 rounded-md border object-contain"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{image.fileName}</span>
              <StatusPill tone={SCAN[image.scanStatus].tone}>
                {SCAN[image.scanStatus].label}
              </StatusPill>
            </span>
            <span className="text-xs text-muted-foreground">
              {sizeText(image.sizeBytes)}
            </span>
            {image.scanStatus === "pending" ? (
              <span className="text-xs text-muted-foreground">
                Not shown to members until the scan finishes.
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              onClick={() => input.current?.click()}
            >
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onRemove}>
              Remove
            </Button>
          </div>
        </div>
      )}
      {error === undefined ? null : (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      )}
    </div>
  );
}
