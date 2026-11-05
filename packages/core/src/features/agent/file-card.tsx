"use client";

import { Button } from "@genie/ui";
import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { FileFormat } from "../../services/agent/file-kinds.ts";
import type { AgentFile } from "../../services/agent/index.ts";

/**
 * A list file that an answer asked for (R-44a): its title, its kind, and the job's state. Download
 * shows only when the file is made, and asks for a link that only this person opens.
 */

const FORMAT_LABELS: Readonly<Record<FileFormat, string>> = {
  csv: "CSV file",
  xlsx: "Excel file",
  md: "Markdown file",
  pdf: "PDF file",
};

function rows(n: number): string {
  return `${n} ${n === 1 ? "row" : "rows"}`;
}

/** Follows the link as a download, as the artifact panel's Download does. */
function follow(url: string): void {
  const link = document.createElement("a");

  link.href = url;
  // The route names the file; an empty value keeps that name.
  link.download = "";
  link.click();
}

export function FileCard(props: {
  readonly title: string;
  readonly format: FileFormat;
  /** The file's row; undefined until the chat reads it after the call. */
  readonly file: AgentFile | undefined;
  /** Answers a short-lived download link for the file id. */
  readonly onDownload: (id: string) => Promise<string>;
}): ReactNode {
  const { file } = props;

  const [refused, setRefused] = useState(false);

  const label = FORMAT_LABELS[props.format];

  const Icon =
    props.format === "xlsx" || props.format === "csv"
      ? FileSpreadsheetIcon
      : FileTextIcon;

  const ready = file?.state === "ready";

  const failed = file?.state === "failed";

  const meta =
    ready && file.rowCount !== null
      ? `${label} · ${rows(file.rowCount)}`
      : label;

  const download = async (id: string) => {
    setRefused(false);

    try {
      follow(await props.onDownload(id));
    } catch {
      setRefused(true);
    }
  };

  return (
    <div
      role="group"
      aria-label={props.title}
      className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <div className="flex min-h-10 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{props.title}</span>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </span>
        {ready ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void download(file.id)}
          >
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
            Download
          </Button>
        ) : (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {failed ? "Not made" : "Making"}
          </span>
        )}
      </div>
      {failed ? (
        <p className="text-sm text-muted-foreground">
          The file could not be made. Ask again in a moment.
        </p>
      ) : null}
      {refused ? (
        <p
          role="alert"
          className="text-sm text-destructive dark:text-destructive-on-dark"
        >
          The download could not start. Try again.
        </p>
      ) : null}
    </div>
  );
}
